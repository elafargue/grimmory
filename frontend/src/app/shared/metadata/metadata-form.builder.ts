import {Service} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import type {MetadataField, MetadataFieldValueType} from './metadata-fields';

export type MetadataFormValue = string | number | boolean | readonly string[] | null | undefined;

export function toFormValue(field: MetadataField, value: MetadataFormValue): MetadataFormValue {
  if (field.valueType !== 'array') return value ?? null;
  return typeof value === 'object' && value !== null ? [...value] : [];
}

export function readFormValue(form: FormGroup, field: MetadataField): MetadataFormValue {
  const value: unknown = form.get(field.name)?.value;
  switch (field.valueType) {
    case 'array':
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    case 'number':
      return (typeof value === 'number' || typeof value === 'string') && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : null;
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    default:
      return typeof value === 'string' ? value : null;
  }
}

export function emptyFormValue(valueType: MetadataFieldValueType): MetadataFormValue {
  switch (valueType) {
    case 'array':
      return [];
    case 'number':
    case 'boolean':
      return null;
    default:
      return '';
  }
}

@Service()
export class MetadataFormBuilder {

  buildForm(fields: readonly MetadataField[]): FormGroup {
    const controls: Record<string, FormControl> = {};

    for (const field of fields) {
      controls[field.name] = new FormControl(emptyFormValue(field.valueType));
      controls[field.lockName] = new FormControl(false);
    }

    return new FormGroup(controls);
  }

  applyLockStates(
    metadataForm: FormGroup,
    lockedFields: Record<string, boolean>,
    fields: readonly MetadataField[]
  ): void {
    for (const key of Object.keys(metadataForm.controls)) {
      if (!key.endsWith('Locked')) {
        metadataForm.get(key)?.enable({emitEvent: false});
      }
    }

    for (const field of fields) {
      if (lockedFields[field.lockName]) {
        metadataForm.get(field.name)?.disable({emitEvent: false});
      }
    }
  }

  setAllFieldsLocked(metadataForm: FormGroup, locked: boolean): void {
    for (const key of Object.keys(metadataForm.controls)) {
      if (key.endsWith('Locked')) {
        metadataForm.get(key)?.setValue(locked);
        const fieldName = key.replace('Locked', '');
        if (locked) {
          metadataForm.get(fieldName)?.disable();
        } else {
          metadataForm.get(fieldName)?.enable();
        }
      }
    }
  }
}
