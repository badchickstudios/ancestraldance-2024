import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {Singleton} from "SpectaclesInteractionKit.lspkg/Decorators/Singleton"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {BaseTextInputComponent} from "./BaseTextInputComponent"

const KEYBOARD_DELAY_DESELECT = 750
/**
 * TextInputComponentManager helps manage functions across all text input components
 * (both TextInputField and TextInputArea).
 * This class is created and handled automatically and dynamically.
 * You should not have to add it manually.
 * If you see it in the scene preview that is good!
 */
@Singleton
export class TextInputComponentManager {
  public static getInstance: () => TextInputComponentManager

  public textInputFields: BaseTextInputComponent[] = []
  public active: Set<BaseTextInputComponent> = new Set()
  public recentlyClosed: boolean = false
  private fieldToInteractables: {[key: string]: Interactable} = {}
  private interactables: Set<Interactable> = new Set()
  private initialized: boolean = false

  public constructor() {
    if (!this.initialized) {
      this.initialize()
    }
  }

  public initialize = () => {
    this.initialized = true
  }

  public addField = (field: BaseTextInputComponent) => {
    this.textInputFields.push(field)
    const interactable = field.interactable
    this.fieldToInteractables[field.uniqueIdentifier] = interactable
    this.interactables.add(interactable)
  }

  public isRegisteredTextFieldInteractable = (interactable: Interactable): boolean => {
    return this.interactables.has(interactable)
  }

  public removeField = (field: BaseTextInputComponent) => {
    const index = this.textInputFields.indexOf(field)
    const interactable = this.fieldToInteractables[field.uniqueIdentifier]
    this.interactables.delete(interactable)
    delete this.fieldToInteractables[field.uniqueIdentifier]
    if (index > -1) {
      this.textInputFields.splice(index, 1)
    }
  }

  public deselectAll = async (): Promise<void> => {
    for (const field of [...this.active.values()]) {
      field.editMode(false)
    }
    this.recentlyClosed = true
    setTimeout(() => {
      this.recentlyClosed = false
    }, KEYBOARD_DELAY_DESELECT)
  }

  public registerActive = (field: BaseTextInputComponent) => {
    this.active.add(field)
  }

  public deregisterActive = (field: BaseTextInputComponent) => {
    this.active.delete(field)
  }
}
