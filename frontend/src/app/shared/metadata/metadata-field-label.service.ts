import {computed, inject, Service} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoService} from '@jsverse/transloco';

import {FIELD_OPTIONS, type BookLockName, type MetadataFieldName} from './metadata-fields';
import type {MetadataProviderField} from './metadata-provider-fields';
import {MetadataProviderFieldsService} from './metadata-provider-fields.service';

@Service()
export class MetadataFieldLabelService {
  private readonly t = inject(TranslocoService);
  private readonly providerFields = inject(MetadataProviderFieldsService);
  private readonly activeLang = toSignal(this.t.langChanges$, {initialValue: this.t.getActiveLang()});
  private readonly providerFieldsByName = computed(
    () => new Map<string, MetadataProviderField>(this.providerFields.fields().map(field => [field.name, field])),
  );

  label(name: MetadataFieldName | BookLockName | 'ebookCover'): string {
    const lang = this.activeLang();
    const providerField = this.providerFieldsByName().get(name);
    if (providerField) return this.providerFields.label(providerField.name);
    return this.t.translate<string>(`metadata.fields.${name}`, {}, lang);
  }

  readonly options = computed((): Partial<Record<string, {label: string; value: string | number}[]>> => {
    const lang = this.activeLang();
    return Object.fromEntries(Object.entries(FIELD_OPTIONS).map(([name, values]) => [
      name,
      values.map((value: string | number) => ({label: this.t.translate<string>(`metadata.fieldValues.${name}.${value}`, {}, lang), value})),
    ]));
  });
}
