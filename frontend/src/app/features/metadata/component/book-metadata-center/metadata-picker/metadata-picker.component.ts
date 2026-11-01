import {Component, computed, DestroyRef, effect, inject, Input, output, signal} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {Book, BookMetadata, MetadataClearFlags, MetadataUpdateWrapper} from '../../../../book/model/book.model';
import {MessageService} from '@openng/optimus-ui/api';
import {CdkDragDrop, CdkDropList, CdkDrag, moveItemInArray} from '@angular/cdk/drag-drop';
import {Button} from '@openng/optimus-ui/button';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {InputText} from '@openng/optimus-ui/inputtext';
import {forkJoin, Observable} from 'rxjs';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {FacetSuggestionsDirective} from '../../../../book/components/facet-suggestions.directive';
import {BookMetadataManageService} from '../../../../book/service/book-metadata-manage.service';
import {Textarea} from '@openng/optimus-ui/textarea';

import {AutoComplete, AutoCompleteSelectEvent} from '@openng/optimus-ui/autocomplete';
import {Image} from '@openng/optimus-ui/image';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {LazyLoadImageModule} from 'ng-lazyload-image';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {MetadataProviderSpecificFields} from '../../../../../shared/model/app-settings.model';
import {BOOK_LOCKS, bookFieldsNamed, COMIC_FIELDS, readFormValue, MetadataFieldLabelService, MetadataProviderFieldsService, MetadataFormBuilder, MetadataUtilsService, toFormValue, type BookField, type ComicFieldName, type MetadataField} from '../../../../../shared/metadata';
import type {BookDetailComicMetadata} from '../../../../book/data/book-response.models';
import {PickerFieldRow} from './picker-field-row.directive';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

@Component({
  selector: 'app-metadata-picker',
  standalone: true,
  templateUrl: './metadata-picker.component.html',
  styleUrls: ['./metadata-picker.component.scss'],
  imports: [
    Button,
    FormsModule,
    InputText,
    ReactiveFormsModule,
    Tooltip,
    Textarea,
    AutoComplete,
    Image,
    LazyLoadImageModule,
    Checkbox,
    TranslocoDirective,
    CdkDropList,
    CdkDrag,
    FacetSuggestionsDirective,
    NgTemplateOutlet,
    PickerFieldRow,
  ]
})
export class MetadataPickerComponent {
  private readonly messageService = inject(MessageService);
  private readonly bookMetadataManageService = inject(BookMetadataManageService);
  protected urlHelper = inject(UrlHelperService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly formBuilder = inject(MetadataFormBuilder);
  private readonly metadataUtils = inject(MetadataUtilsService);
  private readonly t = inject(TranslocoService);
  private readonly providerFields = inject(MetadataProviderFieldsService);
  protected readonly fieldLabels = inject(MetadataFieldLabelService);

  // Cached arrays for template binding (avoid getter re-computation)
  readonly bookSections = [
    {icon: 'pi-info-circle', titleKey: 'sectionBasicInfo', fields: bookFieldsNamed(['title', 'subtitle', 'authors', 'publisher', 'publishedDate'])},
    {icon: 'pi-tags', titleKey: 'sectionTagsCategories', fields: bookFieldsNamed(['categories', 'moods', 'tags'])},
    {icon: 'pi-align-left', titleKey: 'sectionDescription', fields: bookFieldsNamed(['description'])},
    {icon: 'pi-book', titleKey: 'sectionSeriesInfo', fields: bookFieldsNamed(['seriesName', 'seriesNumber', 'seriesTotal'])},
    {icon: 'pi-id-card', titleKey: 'sectionBookDetails', fields: bookFieldsNamed(['language', 'isbn10', 'isbn13', 'pageCount'])},
  ] as const;
  readonly audiobookMetadataFields = bookFieldsNamed(['narrator', 'abridged']);
  private readonly bookFields = [...this.bookSections.flatMap((section): readonly BookField[] => section.fields), ...this.audiobookMetadataFields];
  readonly comicFields = COMIC_FIELDS;
  comicSectionExpanded = false;

  @Input() reviewMode!: boolean;
  @Input() fetchedMetadata!: BookMetadata;
  @Input()
  set book(value: Book | null) {
    this.currentBook = value;

    const metadata = value?.metadata;
    if (!metadata) return;

    if (this.reviewMode) {
      this.metadataForm.reset();
      this.copiedFields = {};
      this.savedFields = {};
      this.hoveredFields = {};
    }

    this.originalMetadata = metadata;
    this.originalMetadata.thumbnailUrl = this.urlHelper.getThumbnailUrl(metadata.bookId, metadata.coverUpdatedOn);
    this.currentBookId = metadata.bookId;
    this.patchMetadataToForm(metadata);
  }

  get book(): Book | null {
    return this.currentBook;
  }

  readonly goBack = output<boolean>();

  currentBook: Book | null = null;

  authorInputValue = '';

  metadataForm!: FormGroup;
  currentBookId!: number;
  copiedFields: Record<string, boolean> = {};
  savedFields: Record<string, boolean> = {};
  originalMetadata!: BookMetadata;
  isSaving = false;
  hoveredFields: Record<string, boolean> = {};

  private readonly enabledProviderFields = signal<MetadataProviderSpecificFields | null>(null);
  private readonly allFields = computed(() => [...this.bookFields, ...this.providerFields.fields()]);
  readonly metadataProviderFields = computed(() => {
    const enabled = this.enabledProviderFields();
    return this.providerFields.fields().filter(field => !enabled || enabled[field.name]);
  });

  constructor() {
    this.metadataForm = this.formBuilder.buildForm([...this.allFields(), ...COMIC_FIELDS]);
    this.metadataForm.addControl('thumbnailUrl', new FormControl(''));
    this.metadataForm.addControl('audiobookThumbnailUrl', new FormControl(''));
    this.metadataForm.addControl('coverLocked', new FormControl(false));
    this.metadataForm.addControl('audiobookCoverLocked', new FormControl(false));
  }

  private readonly syncProviderFieldsEffect = effect(() => {
    const settings = this.appSettingsService.appSettings();
    if (settings?.metadataProviderSpecificFields) {
      this.enabledProviderFields.set(settings.metadataProviderSpecificFields);
    }
  });

  private patchMetadataToForm(metadata: BookMetadata): void {
    const patchData: Record<string, unknown> = {};

    for (const field of this.allFields()) {
      patchData[field.name] = toFormValue(field, metadata[field.name]);
      patchData[field.lockName] = metadata[field.lockName] ?? false;
    }

    // Handle special fields - ebook cover
    patchData['thumbnailUrl'] = this.urlHelper.getCoverUrl(metadata.bookId, metadata.coverUpdatedOn);
    patchData['coverLocked'] = metadata.coverLocked ?? false;

    // Handle audiobook cover
    patchData['audiobookThumbnailUrl'] = this.urlHelper.getAudiobookCoverUrl(metadata.bookId, metadata.audiobookCoverUpdatedOn);
    patchData['audiobookCoverLocked'] = metadata.audiobookCoverLocked ?? false;

    // Handle comic book metadata fields (nested under comicMetadata)
    const comicMeta: BookDetailComicMetadata | undefined = metadata.comicMetadata;
    for (const field of COMIC_FIELDS) {
      patchData[field.name] = toFormValue(field, comicMeta?.[field.name]);
      patchData[field.lockName] = comicMeta?.[field.lockName] ?? false;
    }

    this.metadataForm.patchValue(patchData);
    this.applyLockStates(metadata);
    this.comicSectionExpanded = this.hasComicData(this.fetchedMetadata?.comicMetadata) || this.hasComicData(this.currentBook?.metadata?.comicMetadata);
  }

  private applyLockStates(metadata: BookMetadata): void {
    const lockedFields: Record<string, boolean> = {};
    for (const field of this.allFields()) {
      lockedFields[field.lockName] = !!metadata[field.lockName];
    }
    // Handle comic book metadata lock states (nested under comicMetadata)
    const comicMeta: BookDetailComicMetadata | undefined = metadata.comicMetadata;
    for (const field of COMIC_FIELDS) {
      lockedFields[field.lockName] = !!comicMeta?.[field.lockName];
    }
    this.formBuilder.applyLockStates(this.metadataForm, lockedFields, [...this.allFields(), ...COMIC_FIELDS]);
  }

  onAutoCompleteSelect(fieldName: string, event: AutoCompleteSelectEvent) {
    const values = (this.metadataForm.get(fieldName)?.value as string[]) || [];
    if (!values.includes(event.value as string)) {
      this.metadataForm.get(fieldName)?.setValue([...values, event.value as string]);
    }
    (event.originalEvent.target as HTMLInputElement).value = '';
  }

  onAutoCompleteKeyUp(fieldName: string, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const input = event.target as HTMLInputElement;
      const value = input.value?.trim();
      if (value) {
        const values = this.metadataForm.get(fieldName)?.value || [];
        if (!values.includes(value)) {
          this.metadataForm.get(fieldName)?.setValue([...values, value]);
        }
        input.value = '';
      }
    }
  }

  dropAuthor(event: CdkDragDrop<string[]>) {
    const authors = [...(this.metadataForm.get('authors')?.value ?? [])];
    moveItemInArray(authors, event.previousIndex, event.currentIndex);
    this.metadataForm.get('authors')?.setValue(authors);
    this.metadataForm.get('authors')?.markAsDirty();
  }

  removeAuthor(index: number) {
    const authors = [...(this.metadataForm.get('authors')?.value ?? [])];
    authors.splice(index, 1);
    this.metadataForm.get('authors')?.setValue(authors);
    this.metadataForm.get('authors')?.markAsDirty();
  }

  onAuthorInputKeyUp(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const value = this.authorInputValue?.trim();
      if (value) {
        const authors = this.metadataForm.get('authors')?.value || [];
        if (!authors.includes(value)) {
          this.metadataForm.get('authors')?.setValue([...authors, value]);
          this.metadataForm.get('authors')?.markAsDirty();
        }
        this.authorInputValue = '';
      }
    }
  }

  onAuthorInputSelect(event: AutoCompleteSelectEvent) {
    const authors = (this.metadataForm.get('authors')?.value as string[]) || [];
    const value = event.value as string;
    if (!authors.includes(value)) {
      this.metadataForm.get('authors')?.setValue([...authors, value]);
      this.metadataForm.get('authors')?.markAsDirty();
    }
    setTimeout(() => this.authorInputValue = '');
  }

  onSave(): void {
    this.isSaving = true;
    const updatedBookMetadata = this.buildMetadataWrapper(undefined);

    const requests: Observable<unknown>[] = [
      this.bookMetadataManageService.updateBookMetadata(this.currentBookId, updatedBookMetadata, false, 'REPLACE_WHEN_PROVIDED')
    ];

    // Handle audiobook cover upload when fetched from Audible provider
    if (this.isAudibleProvider() && this.copiedFields['audiobookThumbnailUrl']) {
      const audiobookCoverUrl = this.fetchedMetadata.thumbnailUrl;
      if (audiobookCoverUrl) {
        requests.push(this.bookMetadataManageService.uploadAudiobookCoverFromUrl(this.currentBookId, audiobookCoverUrl));
      }
    }

    forkJoin(requests).subscribe({
      next: () => {
        this.isSaving = false;
        for (const field of Object.keys(this.copiedFields)) {
          if (this.copiedFields[field]) {
            this.savedFields[field] = true;
          }
        }
        this.messageService.add({severity: 'info', summary: this.t.translate('metadata.picker.toast.successSummary'), detail: this.t.translate('metadata.picker.toast.metadataUpdated')});
      },
      error: () => {
        this.isSaving = false;
        this.messageService.add({severity: 'error', summary: this.t.translate('metadata.picker.toast.errorSummary'), detail: this.t.translate('metadata.picker.toast.metadataUpdateFailed')});
      }
    });
  }

  private buildMetadataWrapper(shouldLockAllFields: boolean | undefined): MetadataUpdateWrapper {
    const metadata = this.buildMetadataFromForm();

    if (shouldLockAllFields !== undefined) {
      (metadata as BookMetadata & { allFieldsLocked?: boolean }).allFieldsLocked = shouldLockAllFields;
    }

    const clearFlags = this.inferClearFlags(metadata, this.originalMetadata);

    return {
      metadata: metadata,
      clearFlags: clearFlags
    };
  }

  private buildMetadataFromForm(): BookMetadata {
    const metadata: Record<string, unknown> = {bookId: this.currentBookId};

    for (const field of this.allFields()) {
      metadata[field.name] = readFormValue(this.metadataForm, field);
      metadata[field.lockName] = this.metadataForm.get(field.lockName)?.value ?? false;
    }

    metadata['thumbnailUrl'] = this.getThumbnail();
    metadata['coverLocked'] = this.metadataForm.get('coverLocked')?.value;
    metadata['audiobookCoverLocked'] = this.metadataForm.get('audiobookCoverLocked')?.value;

    // Build comic metadata from form controls
    const comicMetadata: Record<string, unknown> = {};
    for (const field of COMIC_FIELDS) {
      comicMetadata[field.name] = readFormValue(this.metadataForm, field);
      comicMetadata[field.lockName] = this.metadataForm.get(field.lockName)?.value ?? false;
    }
    metadata['comicMetadata'] = comicMetadata;

    return metadata as BookMetadata;
  }

  private inferClearFlags(current: BookMetadata, original: BookMetadata): MetadataClearFlags {
    const flags: Record<string, boolean> = {};

    for (const field of this.allFields()) {
      const key = field.name;
      const curr = current[key];
      const orig = original[key];

      if (field.valueType === 'array') {
        flags[key] = !(curr as string[])?.length && !!(orig as string[])?.length;
      } else if (field.valueType === 'number') {
        flags[key] = curr === null && orig !== null;
      } else if (field.valueType === 'boolean') {
        flags[key] = curr === null && orig !== null;
      } else {
        flags[key] = !curr && !!orig;
      }
    }

    return flags;
  }

  getThumbnail(): string | null {
    if (this.copiedFields['thumbnailUrl']) {
      return (this.fetchedMetadata['thumbnailUrl' as keyof BookMetadata] as string) || null;
    }
    // For Audible provider, audiobook cover is handled separately via uploadAudiobookCoverFromUrl
    if (this.isAudibleProvider()) {
      return null;
    }
    const thumbnailUrl = this.metadataForm.get('thumbnailUrl')?.value;
    if (thumbnailUrl?.includes('api/v1')) {
      return null;
    }
    return null;
  }

  private updateMetadata(shouldLockAllFields: boolean | undefined): void {
    this.bookMetadataManageService.updateBookMetadata(this.currentBookId, this.buildMetadataWrapper(shouldLockAllFields), false, 'REPLACE_WHEN_PROVIDED').subscribe({
      next: () => {
        if (shouldLockAllFields !== undefined) {
          this.messageService.add({
            severity: 'success',
            summary: shouldLockAllFields ? this.t.translate('metadata.picker.toast.metadataLocked') : this.t.translate('metadata.picker.toast.metadataUnlocked'),
            detail: shouldLockAllFields
              ? this.t.translate('metadata.picker.toast.allFieldsLocked')
              : this.t.translate('metadata.picker.toast.allFieldsUnlocked'),
          });
        }
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('metadata.picker.toast.errorSummary'),
          detail: this.t.translate('metadata.picker.toast.lockStateFailed'),
        });
      }
    });
  }

  toggleLock(field: string): void {
    const controlName = field;
    let lockField = field;
    if (field === 'thumbnailUrl') {
      lockField = 'cover';
    } else if (field === 'audiobookThumbnailUrl') {
      lockField = 'audiobookCover';
    }
    const isLocked = this.metadataForm.get(lockField + 'Locked')?.value;
    const updatedLockedState = !isLocked;
    this.metadataForm.get(lockField + 'Locked')?.setValue(updatedLockedState);
    if (updatedLockedState) {
      this.metadataForm.get(controlName)?.disable();
    } else {
      this.metadataForm.get(controlName)?.enable();
    }
    this.updateMetadata(undefined);
  }

  copyMissing(): void {
    this.metadataUtils.copyMissingFields(
      this.fetchedMetadata,
      this.metadataForm,
      this.copiedFields,
      (field) => this.copyFetchedToCurrent(field)
    );
    // Also copy missing comic fields
    if (this.fetchedMetadata?.comicMetadata) {
      for (const field of COMIC_FIELDS) {
        const isLocked = this.metadataForm.get(field.lockName)?.value;
        const currentValue = this.metadataForm.get(field.name)?.value;
        const fetchedValue = this.fetchedMetadata.comicMetadata[field.name];
        const isEmpty = Array.isArray(currentValue)
          ? currentValue.length === 0
          : (currentValue === null || currentValue === undefined || currentValue === '');
        const hasFetchedValue = fetchedValue !== null && fetchedValue !== undefined && fetchedValue !== '';
        if (!isLocked && isEmpty && hasFetchedValue) {
          this.copyFetchedToCurrent(field.name);
        }
      }
    }
  }

  copyAll(): void {
    this.metadataUtils.copyAllFields(
      this.fetchedMetadata,
      this.metadataForm,
      (field) => this.copyFetchedToCurrent(field)
    );
    // Also copy all comic fields
    if (this.fetchedMetadata?.comicMetadata) {
      for (const field of COMIC_FIELDS) {
        const isLocked = this.metadataForm.get(field.lockName)?.value;
        const fetchedValue = this.fetchedMetadata.comicMetadata[field.name];
        if (!isLocked && fetchedValue != null && fetchedValue !== '') {
          this.copyFetchedToCurrent(field.name);
        }
      }
    }
  }

  copyFetchedToCurrent(field: string): void {
    // Handle comic fields (nested under comicMetadata)
    const comicField = this.comicFieldNamed(field);
    if (comicField) {
      const isLocked = this.metadataForm.get(comicField.lockName)?.value;
      if (isLocked) {
        this.messageService.add({
          severity: 'warn',
          summary: this.t.translate('metadata.picker.toast.actionBlockedSummary'),
          detail: this.t.translate('metadata.picker.toast.fieldLockedDetail', {field: this.fieldLabels.label(comicField.name)})
        });
        return;
      }
      const value = this.fetchedMetadata?.comicMetadata?.[comicField.name];
      if (value !== null && value !== undefined && value !== '') {
        this.metadataForm.get(field)?.setValue(value);
        this.copiedFields[field] = true;
        this.highlightCopiedInput(field);
      }
      return;
    }

    const lockFieldName = field === 'thumbnailUrl' ? 'cover' : field === 'audiobookThumbnailUrl' ? 'audiobookCover' : field;
    const lock = [...BOOK_LOCKS, ...this.providerFields.fields()].find(candidate => candidate.name === lockFieldName);
    if (lock && this.metadataForm.get(lock.lockName)?.value) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('metadata.picker.toast.actionBlockedSummary'),
        detail: this.t.translate('metadata.picker.toast.fieldLockedDetail', {field: this.fieldLabels.label(lock.name)})
      });
      return;
    }
    // For audiobook cover from Audible, use the thumbnailUrl from fetched metadata
    if (field === 'audiobookThumbnailUrl') {
      this.metadataForm.get('audiobookThumbnailUrl')?.setValue(this.fetchedMetadata.thumbnailUrl);
      this.copiedFields['audiobookThumbnailUrl'] = true;
      this.highlightCopiedInput(field);
      return;
    }
    if (this.metadataUtils.copyFieldToForm(field, this.fetchedMetadata, this.metadataForm, this.copiedFields)) {
      this.highlightCopiedInput(field);
    }
  }

  lockAll(): void {
    this.formBuilder.setAllFieldsLocked(this.metadataForm, true);
    this.updateMetadata(true);
  }

  unlockAll(): void {
    this.formBuilder.setAllFieldsLocked(this.metadataForm, false);
    this.updateMetadata(false);
  }

  highlightCopiedInput(field: string): void {
    this.copiedFields = {...this.copiedFields, [field]: true};
  }

  isValueCopied(field: string): boolean {
    return this.copiedFields[field];
  }

  isValueSaved(field: string): boolean {
    return this.savedFields[field];
  }

  goBackClick(): void {
    this.goBack.emit(true);
  }

  onMouseEnter(controlName: string): void {
    if (this.isValueCopied(controlName) && !this.isValueSaved(controlName)) {
      this.hoveredFields[controlName] = true;
    }
  }

  onMouseLeave(controlName: string): void {
    this.hoveredFields[controlName] = false;
  }

  resetField(field: string): void {
    const comicField = this.comicFieldNamed(field);
    if (comicField) {
      this.metadataForm.get(field)?.setValue(toFormValue(comicField, this.originalMetadata?.comicMetadata?.[comicField.name]));
      this.copiedFields[field] = false;
      this.hoveredFields[field] = false;
      return;
    }
    this.metadataUtils.resetField(field, this.metadataForm, this.originalMetadata, this.copiedFields, this.hoveredFields);
  }

  isAudibleProvider(): boolean {
    return this.fetchedMetadata?.provider?.toLowerCase() === 'audible';
  }

  // Cover type detection methods
  hasEbookFormat(book: Book): boolean {
    if (book.isPhysical) {
      return true;
    }
    const allFiles = [book.primaryFile, ...(book.alternativeFormats ?? [])].filter(f => f?.bookType);
    return allFiles.some(f => f!.bookType !== 'AUDIOBOOK');
  }

  hasAudiobookFormat(book: Book): boolean {
    const allFiles = [book.primaryFile, ...(book.alternativeFormats ?? [])].filter(f => f?.bookType);
    return allFiles.some(f => f!.bookType === 'AUDIOBOOK');
  }

  supportsDualCovers(book: Book): boolean {
    return this.hasEbookFormat(book) && this.hasAudiobookFormat(book);
  }

  // Comic metadata helpers
  hasComicData(comic: BookMetadata['comicMetadata']): boolean {
    if (!comic) return false;
    return COMIC_FIELDS.some(field => {
      const value = comic[field.name];
      if (value === null || value === undefined || value === '' || value === false) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });
  }

  shouldShowComicSection(): boolean {
    return this.hasComicData(this.fetchedMetadata?.comicMetadata) || this.hasComicData(this.currentBook?.metadata?.comicMetadata) ||
      this.currentBook?.primaryFile?.bookType === 'CBX' ||
      this.fetchedMetadata?.provider?.toLowerCase() === 'comicvine';
  }

  getFetchedComicValue(name: ComicFieldName): unknown {
    return this.fetchedMetadata?.comicMetadata?.[name];
  }

  private comicFieldNamed(controlName: string): MetadataField<ComicFieldName> | undefined {
    return COMIC_FIELDS.find(f => f.name === controlName);
  }
}
