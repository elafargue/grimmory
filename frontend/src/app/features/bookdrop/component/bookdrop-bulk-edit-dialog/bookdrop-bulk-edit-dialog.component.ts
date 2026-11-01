import {Component, inject, OnInit, ChangeDetectorRef} from '@angular/core';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {Button} from '@openng/optimus-ui/button';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {InputText} from '@openng/optimus-ui/inputtext';
import {AutoComplete} from '@openng/optimus-ui/autocomplete';
import {Divider} from '@openng/optimus-ui/divider';
import {SelectButton} from '@openng/optimus-ui/selectbutton';
import {FacetSuggestionsDirective} from '../../../book/components/facet-suggestions.directive';
import {BookMetadata} from '../../../book/model/book.model';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {bookFieldsNamed, emptyFormValue, MetadataFieldLabelService, type MetadataFormValue} from '../../../../shared/metadata';

export interface BulkEditResult {
  fields: Partial<BookMetadata>;
  enabledFields: Set<string>;
  mergeArrays: boolean;
}

@Component({
  selector: 'app-bookdrop-bulk-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    Checkbox,
    InputText,
    AutoComplete,
    Divider,
    SelectButton,
    TranslocoDirective,
    TranslocoPipe,
    FacetSuggestionsDirective,
  ],
  templateUrl: './bookdrop-bulk-edit-dialog.component.html',
  styleUrl: './bookdrop-bulk-edit-dialog.component.scss'
})
export class BookdropBulkEditDialogComponent implements OnInit {

  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly config = inject(DynamicDialogConfig);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly t = inject(TranslocoService);
  protected readonly fieldLabels = inject(MetadataFieldLabelService);

  fileCount: number = 0;
  mergeArrays = true;

  enabledFields = new Set<string>();

  private readonly fields = bookFieldsNamed(['authors', 'publisher', 'categories', 'moods', 'tags', 'seriesName', 'seriesTotal', 'language']);

  bulkEditForm = new FormGroup(Object.fromEntries(this.fields.map(field => [
    field.name,
    new FormControl<MetadataFormValue>(emptyFormValue(field.valueType)),
  ])));

  textFields = this.fields.filter(field => field.valueType === 'string');

  numberFields = this.fields.filter(field => field.valueType === 'number');

  chipFields = this.fields.filter(field => field.valueType === 'array');

  mergeOptions = [
    {label: this.t.translate('bookdrop.bulkEdit.mergeOption'), value: true},
    {label: this.t.translate('bookdrop.bulkEdit.replaceOption'), value: false},
  ];

  ngOnInit(): void {
    this.fileCount = this.config.data?.fileCount ?? 0;
    this.setupFormValueChangeListeners();
  }

  private setupFormValueChangeListeners(): void {
    Object.keys(this.bulkEditForm.controls).forEach(fieldName => {
      const control = this.bulkEditForm.get(fieldName);
      control?.valueChanges.subscribe(value => {
        const hasValue = Array.isArray(value) ? value.length > 0 : (value !== null && value !== '' && value !== undefined);
        if (hasValue && !this.enabledFields.has(fieldName)) {
          this.enabledFields.add(fieldName);
          this.cdr.detectChanges();
        }
      });
    });
  }

  onAutoCompleteKeyUp(fieldName: string, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.addTypedValue(fieldName, event);
    }
  }

  addTypedValue(fieldName: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const inputValue = target?.value?.trim();
    if (inputValue) {
      const control = this.bulkEditForm.get(fieldName);
      const currentValue = (control?.value as string[]) || [];
      if (!currentValue.includes(inputValue)) {
        control?.setValue([...currentValue, inputValue]);
      }
      if (target) {
        target.value = '';
      }
    }

    if (!this.enabledFields.has(fieldName)) {
      const control = this.bulkEditForm.get(fieldName);
      const value = control?.value;
      if (Array.isArray(value) && value.length > 0) {
        this.enabledFields.add(fieldName);
        this.cdr.detectChanges();
      }
    }
  }

  toggleField(fieldName: string): void {
    if (this.enabledFields.has(fieldName)) {
      this.enabledFields.delete(fieldName);
    } else {
      this.enabledFields.add(fieldName);
    }
  }

  isFieldEnabled(fieldName: string): boolean {
    return this.enabledFields.has(fieldName);
  }

  getControl(controlName: string): FormControl {
    return this.bulkEditForm.get(controlName) as FormControl;
  }

  get hasEnabledFields(): boolean {
    return this.enabledFields.size > 0;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  apply(): void {
    const formValue = this.bulkEditForm.value;
    const fields: Partial<BookMetadata> = {};

    this.enabledFields.forEach(fieldName => {
      const value = formValue[fieldName as keyof typeof formValue];

      if (value !== undefined && value !== null) {
        (fields as Record<string, unknown>)[fieldName] = value;
      }
    });

    const result: BulkEditResult = {
      fields,
      enabledFields: new Set(this.enabledFields),
      mergeArrays: this.mergeArrays,
    };

    this.dialogRef.close(result);
  }
}
