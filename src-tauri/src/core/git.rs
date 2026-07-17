//! Git 相关的纯业务逻辑（基于 git2/libgit2），不依赖 tauri，方便单测。

use crate::error::AppError;
use git2::{BranchType, DiffOptions, Repository, RepositoryState, Status, StatusOptions};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub staged: bool,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub is_repo: bool,
    pub files: Vec<GitFileStatus>,
    /// 是否处于 merge / cherry-pick / revert 等需解决冲突的状态
    pub merge_in_progress: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub author: String,
    pub time: i64,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
}

const MAX_DIFF_LINES: usize = 20_000;
const MAX_LOG_LIMIT: usize = 500;
const DIFF_TRUNCATED_MESSAGE: &str = "... diff 过大，已截断后续内容 ...";

fn open_repo(workspace_path: &str) -> Result<Repository, AppError> {
    Repository::discover(workspace_path).map_err(|e| AppError::new(e.to_string()))
}

fn push_truncated_diff_line(lines: &mut Vec<DiffLine>) {
    lines.push(DiffLine {
        origin: " ".to_string(),
        content: DIFF_TRUNCATED_MESSAGE.to_string(),
        old_lineno: None,
        new_lineno: None,
    });
}

fn relative_path(workdir: &Path, file_path: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(file_path);
    if path.is_absolute() {
        let workdir_norm = workdir
            .canonicalize()
            .unwrap_or_else(|_| workdir.to_path_buf());
        let path_norm = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf());
        path_norm
            .strip_prefix(&workdir_norm)
            .or_else(|_| path.strip_prefix(workdir))
            .map(|p| p.to_path_buf())
            .map_err(|_| AppError::new("路径不在工作区内".to_string()))
    } else {
        Ok(path.to_path_buf())
    }
}

/// 将 git2 的组合状态标志拆解为若干条 (是否已暂存, 类型) 记录，
/// 因为同一个文件可能同时存在"已暂存的修改"和"未暂存的新修改"。
fn classify_status(s: Status) -> Vec<(bool, String)> {
    let mut result = Vec::new();

    // 冲突文件优先单独标出，避免再拆成 modified 造成面板误导
    if s.contains(Status::CONFLICTED) {
        result.push((false, "conflicted".to_string()));
        return result;
    }

    if s.contains(Status::INDEX_NEW) {
        result.push((true, "new".to_string()));
    } else if s.contains(Status::INDEX_MODIFIED) {
        result.push((true, "modified".to_string()));
    } else if s.contains(Status::INDEX_DELETED) {
        result.push((true, "deleted".to_string()));
    } else if s.contains(Status::INDEX_RENAMED) {
        result.push((true, "renamed".to_string()));
    } else if s.contains(Status::INDEX_TYPECHANGE) {
        result.push((true, "typechange".to_string()));
    }

    if s.contains(Status::WT_NEW) {
        result.push((false, "new".to_string()));
    } else if s.contains(Status::WT_MODIFIED) {
        result.push((false, "modified".to_string()));
    } else if s.contains(Status::WT_DELETED) {
        result.push((false, "deleted".to_string()));
    } else if s.contains(Status::WT_RENAMED) {
        result.push((false, "renamed".to_string()));
    } else if s.contains(Status::WT_TYPECHANGE) {
        result.push((false, "typechange".to_string()));
    }

    result
}

fn merge_in_progress(repo: &Repository) -> bool {
    matches!(
        repo.state(),
        RepositoryState::Merge
            | RepositoryState::Revert
            | RepositoryState::RevertSequence
            | RepositoryState::CherryPick
            | RepositoryState::CherryPickSequence
    )
}

/// 检测工作区是否是 git 仓库，并返回改动文件列表（区分已暂存/未暂存）。
pub fn status(workspace_path: &str) -> Result<GitStatusResult, AppError> {
    let repo = match Repository::discover(workspace_path) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitStatusResult {
                is_repo: false,
                files: vec![],
                merge_in_progress: false,
            })
        }
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| AppError::new(e.to_string()))?;

    let mut files = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or_default().to_string();
        for (staged, kind) in classify_status(entry.status()) {
            files.push(GitFileStatus {
                path: path.clone(),
                staged,
                kind,
            });
        }
    }

    Ok(GitStatusResult {
        is_repo: true,
        files,
        merge_in_progress: merge_in_progress(&repo),
    })
}

/// 查看单个文件的 diff。`staged` 为 true 时对比 HEAD 树与索引（已暂存的改动），
/// 为 false 时对比索引与工作目录（未暂存的改动）。
pub fn diff_file(workspace_path: &str, file_path: &str, staged: bool) -> Result<Vec<DiffLine>, AppError> {
    let repo = open_repo(workspace_path)?;
    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut diff_opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut diff_opts))
    }
    .map_err(|e| AppError::new(e.to_string()))?;

    let mut lines = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if lines.len() >= MAX_DIFF_LINES {
            if lines.len() == MAX_DIFF_LINES {
                push_truncated_diff_line(&mut lines);
            }
            return false;
        }
        let origin = line.origin();
        if matches!(origin, '+' | '-' | ' ') {
            let content = String::from_utf8_lossy(line.content())
                .trim_end_matches('\n')
                .to_string();
            lines.push(DiffLine {
                origin: origin.to_string(),
                content,
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
            });
        }
        true
    })
    .map_err(|e| AppError::new(e.to_string()))?;

    Ok(lines)
}

/// 暂存单个文件（新增/修改用 add，已从磁盘删除用 remove）。
pub fn stage(workspace_path: &str, file_path: &str) -> Result<(), AppError> {
    let repo = open_repo(workspace_path)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::new("仓库没有工作目录".to_string()))?
        .to_path_buf();
    let rel_path = relative_path(&workdir, file_path)?;
    let absolute = workdir.join(&rel_path);
    let mut index = repo.index().map_err(|e| AppError::new(e.to_string()))?;

    if absolute.exists() {
        index
            .add_path(&rel_path)
            .map_err(|e| AppError::new(e.to_string()))?;
    } else {
        index
            .remove_path(&rel_path)
            .map_err(|e| AppError::new(e.to_string()))?;
    }
    index.write().map_err(|e| AppError::new(e.to_string()))?;
    Ok(())
}

/// 取消暂存单个文件（回退到与 HEAD 一致的索引状态）。
pub fn unstage(workspace_path: &str, file_path: &str) -> Result<(), AppError> {
    let repo = open_repo(workspace_path)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::new("仓库没有工作目录".to_string()))?
        .to_path_buf();
    let rel_path = relative_path(&workdir, file_path)?;
    let rel_path_str = rel_path.to_string_lossy().to_string();

    match repo.head().ok().and_then(|h| h.peel_to_commit().ok()) {
        Some(commit) => {
            repo.reset_default(Some(commit.as_object()), [rel_path_str.as_str()])
                .map_err(|e| AppError::new(e.to_string()))?;
        }
        None => {
            let mut index = repo.index().map_err(|e| AppError::new(e.to_string()))?;
            index.remove_path(&rel_path).ok();
            index.write().map_err(|e| AppError::new(e.to_string()))?;
        }
    }
    Ok(())
}

/// 用当前索引创建一个新的 commit。
pub fn commit(workspace_path: &str, message: &str) -> Result<String, AppError> {
    let repo = open_repo(workspace_path)?;
    let mut index = repo.index().map_err(|e| AppError::new(e.to_string()))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| AppError::new(e.to_string()))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| AppError::new(e.to_string()))?;

    let signature = repo
        .signature()
        .or_else(|_| git2::Signature::now("MarkMFY", "markmfy@local"))
        .map_err(|e| AppError::new(e.to_string()))?;

    let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &signature, &signature, message, &tree, &parents)
        .map_err(|e| AppError::new(e.to_string()))?;

    Ok(oid.to_string())
}

/// 查询 commit 历史（从 HEAD 开始，最多 `limit` 条）。
pub fn log(workspace_path: &str, limit: usize) -> Result<Vec<CommitInfo>, AppError> {
    let repo = open_repo(workspace_path)?;
    let limit = limit.min(MAX_LOG_LIMIT);
    let mut revwalk = repo.revwalk().map_err(|e| AppError::new(e.to_string()))?;
    if revwalk.push_head().is_err() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i >= limit {
            break;
        }
        let oid = oid.map_err(|e| AppError::new(e.to_string()))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| AppError::new(e.to_string()))?;
        result.push(CommitInfo {
            hash: oid.to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            time: commit.time().seconds(),
            message: commit.message().unwrap_or("").trim().to_string(),
        });
    }
    Ok(result)
}

/// 查看该 commit 相对其第一个父提交的 diff，用于历史记录面板的详情查看。
pub fn commit_diff(workspace_path: &str, commit_hash: &str) -> Result<Vec<DiffLine>, AppError> {
    let repo = open_repo(workspace_path)?;
    let oid = git2::Oid::from_str(commit_hash).map_err(|e| AppError::new(e.to_string()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| AppError::new(e.to_string()))?;
    let tree = commit.tree().map_err(|e| AppError::new(e.to_string()))?;
    let parent_tree = commit
        .parents()
        .next()
        .and_then(|p| p.tree().ok());

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| AppError::new(e.to_string()))?;

    let mut lines = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if lines.len() >= MAX_DIFF_LINES {
            if lines.len() == MAX_DIFF_LINES {
                push_truncated_diff_line(&mut lines);
            }
            return false;
        }
        let origin = line.origin();
        if matches!(origin, '+' | '-' | ' ') {
            let content = String::from_utf8_lossy(line.content())
                .trim_end_matches('\n')
                .to_string();
            lines.push(DiffLine {
                origin: origin.to_string(),
                content,
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
            });
        }
        true
    })
    .map_err(|e| AppError::new(e.to_string()))?;

    Ok(lines)
}

/// 列出本地分支。
pub fn branches(workspace_path: &str) -> Result<Vec<BranchInfo>, AppError> {
    let repo = open_repo(workspace_path)?;
    let mut result = Vec::new();
    let branches = repo
        .branches(Some(BranchType::Local))
        .map_err(|e| AppError::new(e.to_string()))?;

    for branch in branches {
        let (branch, _) = branch.map_err(|e| AppError::new(e.to_string()))?;
        let name = branch
            .name()
            .map_err(|e| AppError::new(e.to_string()))?
            .unwrap_or("")
            .to_string();
        result.push(BranchInfo {
            name,
            is_head: branch.is_head(),
        });
    }
    Ok(result)
}

/// 切换到指定分支（要求工作目录无冲突性未提交改动）。
pub fn checkout(workspace_path: &str, branch_name: &str) -> Result<(), AppError> {
    let repo = open_repo(workspace_path)?;
    let (object, reference) = repo
        .revparse_ext(branch_name)
        .map_err(|e| AppError::new(e.to_string()))?;

    repo.checkout_tree(&object, None)
        .map_err(|e| AppError::new(e.to_string()))?;

    match reference {
        Some(gref) => {
            let ref_name = gref
                .name()
                .ok_or_else(|| AppError::new("无效的分支引用".to_string()))?
                .to_string();
            repo.set_head(&ref_name)
        }
        None => repo.set_head_detached(object.id()),
    }
    .map_err(|e| AppError::new(e.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_conflicted_takes_priority() {
        let rows = classify_status(Status::CONFLICTED | Status::WT_MODIFIED);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0], (false, "conflicted".to_string()));
    }

    #[test]
    fn classify_modified_unstaged() {
        let rows = classify_status(Status::WT_MODIFIED);
        assert_eq!(rows, vec![(false, "modified".to_string())]);
    }

    #[test]
    fn classify_staged_and_unstaged() {
        let rows = classify_status(Status::INDEX_MODIFIED | Status::WT_MODIFIED);
        assert_eq!(
            rows,
            vec![
                (true, "modified".to_string()),
                (false, "modified".to_string())
            ]
        );
    }
}
