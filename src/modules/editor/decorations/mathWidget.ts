import { WidgetType } from "@codemirror/view";
import { renderKatexElement } from "./mathRender";

/** 行内 / 块级公式预览 Widget。 */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly displayMode: boolean,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.displayMode === this.displayMode;
  }

  toDOM(): HTMLElement {
    return renderKatexElement(this.tex, this.displayMode);
  }

  ignoreEvent(): boolean {
    return false;
  }
}
