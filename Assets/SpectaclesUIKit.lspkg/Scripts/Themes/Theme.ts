import {Style} from "./Style"

export type Theme = {
  get styles(): Record<string, Record<string, Style>>
  get name(): string
  get defaultStyleName(): string
  get defaultShapeName(): string
  get componentData(): Record<string, unknown>
}

