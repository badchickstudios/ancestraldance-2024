import {Layoutable} from "./Layoutable"

export interface NestableLayout extends Layoutable {
  /**
   * Whether the layout has a fixed width.
   * When true, the layout uses the fixed width value.
   * When false, the layout size is flexible/determined by content.
   */
  fixedWidth: boolean

  /**
   * Whether the layout has a fixed height.
   * When true, the layout uses the fixed height value.
   * When false, the layout size is flexible/determined by content.
   */
  fixedHeight: boolean

  /**
   * Whether the layout has a fixed depth.
   * When true, the layout uses the fixed depth value.
   * When false, the layout size is flexible/determined by content.
   */
  fixedDepth: boolean
}
