import {Directive} from '@angular/core';
import type {BookQueryFacetKey} from '../../../../book/data/book-query-params';
import type {MetadataField, MetadataFieldName} from '../../../../../shared/metadata';

interface PickerFieldRowContext {
  $implicit: MetadataField<MetadataFieldName> & {readonly suggestions?: BookQueryFacetKey};
  fetched: unknown;
}

@Directive({selector: 'ng-template[appPickerFieldRow]'})
export class PickerFieldRow {
  static ngTemplateContextGuard(_dir: PickerFieldRow, _ctx: unknown): _ctx is PickerFieldRowContext {
    return true;
  }
}
