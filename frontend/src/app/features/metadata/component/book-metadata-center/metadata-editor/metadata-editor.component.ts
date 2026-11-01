import {HttpErrorResponse} from '@angular/common/http';
import {Component, computed, DestroyRef, inject, Input, OnInit, output} from "@angular/core";
import {InputText} from "@openng/optimus-ui/inputtext";
import {Button} from "@openng/optimus-ui/button";
import {Divider} from "@openng/optimus-ui/divider";
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule,} from "@angular/forms";
import {Observable, sample} from "rxjs";
import {MessageService} from "@openng/optimus-ui/api";
import {Book, BookMetadata, MetadataClearFlags, MetadataUpdateWrapper,} from "../../../../book/model/book.model";
import {UrlHelperService} from "../../../../../shared/service/url-helper.service";
import {CoverComponent} from "../../../../../shared/components/cover/cover.component";
import {BOOK_FIELDS, BOOK_LOCKS, BOOK_NON_FIELD_LOCKS, bookFieldsNamed, COMIC_FIELDS, MetadataFieldLabelService, MetadataFormBuilder, MetadataProviderFieldsService, providerFieldRecord, readFormValue, toFormValue, type BookField, type MetadataField, type MetadataLock, type MetadataProviderField} from '../../../../../shared/metadata';
import {FileUpload, FileUploadErrorEvent, FileUploadEvent,} from "@openng/optimus-ui/fileupload";
import {HttpResponse} from "@angular/common/http";
import {BookService} from "../../../../book/service/book.service";
import {FacetSuggestionsDirective} from '../../../../book/components/facet-suggestions.directive';
import {BookMetadataManageService} from "../../../../book/service/book-metadata-manage.service";
import {ProgressSpinner} from "@openng/optimus-ui/progressspinner";
import {Tooltip} from "@openng/optimus-ui/tooltip";
import {filter, finalize, take, tap} from "rxjs/operators";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {MetadataRefreshType} from "../../../model/request/metadata-refresh-type.enum";
import {AutoComplete, AutoCompleteSelectEvent} from "@openng/optimus-ui/autocomplete";
import {DatePicker} from "@openng/optimus-ui/datepicker";
import {Textarea} from "@openng/optimus-ui/textarea";
import {Select} from "@openng/optimus-ui/select";
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {BookDialogHelperService} from "../../../../book/service/book-dialog-helper.service";
import {BookNavigationService} from '../../../../book/service/book-navigation.service';
import {BookMetadataHostService} from '../../../../../shared/service/book-metadata-host.service';
import {Router} from '@angular/router';
import {UserService} from '../../../../settings/user-management/user.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {MetadataProviderSpecificFields} from '../../../../../shared/model/app-settings.model';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {CdkDragDrop, CdkDropList, CdkDrag, moveItemInArray} from '@angular/cdk/drag-drop';

import {QueryClient} from '@tanstack/angular-query-experimental';
import {MetadataSourceQueryService} from '../../../sources/metadata-source-query.service';
import type {BookDetailComicMetadata} from '../../../../book/data/book-response.models';

@Component({
  selector: "app-metadata-editor",
  standalone: true,
  templateUrl: "./metadata-editor.component.html",
  styleUrls: ["./metadata-editor.component.scss"],
  imports: [
    InputText,
    Button,
    Divider,
    FormsModule,
    ReactiveFormsModule,
    FileUpload,
    ProgressSpinner,
    Tooltip,
    AutoComplete,
    DatePicker,
    Textarea,
    Select,
    TranslocoDirective,
    CdkDropList,
    CdkDrag,
    CoverComponent,
    FacetSuggestionsDirective,
  ],
})
export class MetadataEditorComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly bookService = inject(BookService);
  private readonly bookMetadataManageService = inject(BookMetadataManageService);
  private readonly taskHelperService = inject(TaskHelperService);
  protected urlHelper = inject(UrlHelperService);
  private readonly bookDialogHelperService = inject(BookDialogHelperService);
  private readonly bookNavigationService = inject(BookNavigationService);
  private readonly metadataHostService = inject(BookMetadataHostService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly t = inject(TranslocoService);
  private readonly queryClient = inject(QueryClient);
  private readonly sources = inject(MetadataSourceQueryService);
  protected readonly providerFields = inject(MetadataProviderFieldsService);
  protected readonly fieldLabels = inject(MetadataFieldLabelService);
  private readonly formBuilder = inject(MetadataFormBuilder);
  private currentBook: Book | null = null;

  @Input()
  set book(value: Book | null) {
    this.currentBook = value;

    const metadata = value?.metadata;
    if (!metadata) return;

    this.currentBookId = metadata.bookId;
    if (this.refreshingBookIds.has(value.id)) {
      this.refreshingBookIds.delete(value.id);
      this.isAutoFetching = false;
    }

    this.originalMetadata = structuredClone(metadata);
    this.populateFormFromMetadata(metadata);
  }

  get book(): Book | null {
    return this.currentBook;
  }

  readonly nextBookClicked = output<void>();
  readonly previousBookClicked = output<void>();
  readonly closeDialogButtonClicked = output<void>();

  @Input() disableNext = false;
  @Input() disablePrevious = false;
  @Input() showNavigationButtons = false;

  metadataForm: FormGroup;
  currentBookId!: number;
  isUploading = false;
  isLoading = false;
  isSaving = false;
  isGeneratingCover = false;
  isGeneratingAudiobookCover = false;

  refreshingBookIds = new Set<number>();
  isAutoFetching = false;
  isFetchingFromFile = false;
  autoSaveEnabled = false;

  originalMetadata!: BookMetadata;

  authorInputValue = '';
  private metadataCenterViewMode: 'route' | 'dialog' = 'route';

  booleanOptions: {label: string, value: boolean | null}[] = [];

  comicSectionExpanded = true;
  audiobookSectionExpanded = true;
  providerSectionExpanded = true;

  comicSingleValueFields = COMIC_FIELDS.filter(field => field.valueType !== 'array' && field.valueType !== 'text');
  comicArrayFields = COMIC_FIELDS.filter(field => field.valueType === 'array');
  comicTextareaFields = COMIC_FIELDS.filter(field => field.valueType === 'text');
  audiobookMetadataFields = bookFieldsNamed(['narrator', 'abridged']);
  readonly formFields = bookFieldsNamed([
    'title', 'subtitle', 'authors', 'publisher', 'publishedDate', 'categories', 'moods', 'tags',
    'seriesName', 'seriesNumber', 'seriesTotal', 'language', 'isbn10', 'isbn13', 'pageCount', 'ageRating', 'contentRating',
  ]);

  private readonly providerSpecificFields = computed<MetadataProviderSpecificFields>(
    () => this.appSettingsService.appSettings()?.metadataProviderSpecificFields
      ?? providerFieldRecord(this.providerFields.fields(), () => true),
  );

  readonly navigationState = this.bookNavigationService.navigationState;
  readonly canNavigatePrevious = this.bookNavigationService.canNavigatePrevious;
  readonly canNavigateNext = this.bookNavigationService.canNavigateNext;
  readonly navigationPosition = computed(() => {
    const position = this.bookNavigationService.currentPosition();
    return position
      ? this.t.translate('metadata.editor.navigationPosition', {current: position.current, total: position.total})
      : '';
  });

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

  constructor() {
    this.metadataForm = this.formBuilder.buildForm(this.lockableFields());
    for (const lock of BOOK_NON_FIELD_LOCKS) this.metadataForm.addControl(lock.lockName, new FormControl(false));

    this.booleanOptions = [
      {label: this.t.translate('metadata.editor.booleanUnknown'), value: null},
      {label: this.t.translate('metadata.editor.booleanYes'), value: true},
      {label: this.t.translate('metadata.editor.booleanNo'), value: false},
    ];
  }

  private topLevelFields(): (BookField | MetadataProviderField)[] {
    return [...BOOK_FIELDS, ...this.providerFields.fields()];
  }

  private lockableFields(): MetadataField[] {
    return [...this.topLevelFields(), ...COMIC_FIELDS];
  }

  ngOnInit(): void {
    const user = this.userService.currentUser();
    if (user) {
      this.metadataCenterViewMode = user.userSettings.metadataCenterViewMode ?? 'route';
      this.autoSaveEnabled = user.userSettings.autoSaveMetadata ?? false;
    }
  }

  private populateFormFromMetadata(metadata: BookMetadata): void {
    const comic: BookDetailComicMetadata | undefined = metadata.comicMetadata;
    const locks = {
      ...Object.fromEntries([...BOOK_LOCKS, ...this.providerFields.fields()].map(lock => [lock.lockName, metadata[lock.lockName] === true])),
      ...Object.fromEntries(COMIC_FIELDS.map(field => [field.lockName, comic?.[field.lockName] === true])),
    };
    this.metadataForm.patchValue({
      ...Object.fromEntries(this.topLevelFields().map(field => [field.name, toFormValue(field, metadata[field.name])])),
      ...Object.fromEntries(COMIC_FIELDS.map(field => [field.name, toFormValue(field, comic?.[field.name])])),
      ...locks,
    });
    this.formBuilder.applyLockStates(this.metadataForm, locks, this.lockableFields());
  }

  onAutoCompleteSelect(fieldName: string, event: AutoCompleteSelectEvent) {
    const values = (this.metadataForm.get(fieldName)?.value as string[]) || [];
    if (!values.includes(event.value as string)) {
      this.metadataForm.get(fieldName)?.setValue([...values, event.value as string]);
    }
    (event.originalEvent.target as HTMLInputElement).value = "";
  }

  onAutoCompleteKeyUp(fieldName: string, event: KeyboardEvent) {
    if (event.key === "Enter") {
      const input = event.target as HTMLInputElement;
      const value = input.value?.trim();
      if (value) {
        const values = this.metadataForm.get(fieldName)?.value || [];
        if (!values.includes(value)) {
          this.metadataForm.get(fieldName)?.setValue([...values, value]);
        }
        input.value = "";
      }
    }
  }

  onSave(): void {
    this.saveMetadata().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  saveMetadata(): Observable<unknown> {
    this.isSaving = true;
    return this.bookMetadataManageService
      .updateBookMetadata(
        this.currentBookId,
        this.buildMetadataWrapper(undefined),
        false
      )
      .pipe(
        tap({
          next: () => {
            this.isSaving = false;
            this.messageService.add({
              severity: "info",
              summary: this.t.translate('metadata.editor.toast.successSummary'),
              detail: this.t.translate('metadata.editor.toast.metadataUpdated'),
            });
            this.metadataForm.markAsPristine();
          },
          error: (err: unknown) => {
            this.isSaving = false;
            const errorMessage =
              err && typeof err === 'object' && 'error' in err && err.error &&
              typeof err.error === 'object' && 'message' in err.error &&
              typeof err.error.message === 'string'
                ? err.error.message
                : this.t.translate('metadata.editor.toast.metadataUpdateFailed');
            this.messageService.add({
              severity: "error",
              summary: this.t.translate('metadata.editor.toast.errorSummary'),
              detail: errorMessage,
            });
          },
        })
      );
  }

  toggleLock(field: string): void {
    const isLocked = this.metadataForm.get(field + "Locked")?.value;
    const updatedLockedState = !isLocked;
    this.metadataForm.get(field + "Locked")?.setValue(updatedLockedState);

    if (updatedLockedState) {
      this.metadataForm.get(field)?.disable();
    } else {
      this.metadataForm.get(field)?.enable();
    }
    this.updateMetadata(undefined);
  }

  lockAll(): void {
    this.formBuilder.setAllFieldsLocked(this.metadataForm, true);
    this.updateMetadata(true);
  }

  unlockAll(): void {
    this.formBuilder.setAllFieldsLocked(this.metadataForm, false);
    this.updateMetadata(false);
  }

  private buildMetadataWrapper(shouldLockAllFields?: boolean): MetadataUpdateWrapper {
    const form = this.metadataForm;

    const valuesOf = (fields: readonly MetadataField[]) =>
      Object.fromEntries(fields.map(field => [field.name, readFormValue(form, field)]));
    const locksOf = (locks: readonly MetadataLock[]) => Object.fromEntries(locks.map(lock => [lock.lockName, form.get(lock.lockName)?.value]));

    const metadata: BookMetadata = {
      bookId: this.currentBookId,
      ...valuesOf(this.topLevelFields()),
      ...locksOf([...BOOK_LOCKS, ...this.providerFields.fields()]),
      comicMetadata: {...valuesOf(COMIC_FIELDS), ...locksOf(COMIC_FIELDS)},

      ...(shouldLockAllFields !== undefined && {
        allFieldsLocked: shouldLockAllFields,
      }),
    };

    const original = this.originalMetadata;

    const wasCleared = (key: keyof BookMetadata): boolean => {
      const current = (metadata[key]) ?? null;
      const prev = (original[key]) ?? null;

      const isEmpty = (val: unknown): boolean =>
        val === null || val === "" || (Array.isArray(val) && val.length === 0);

      return isEmpty(current) && !isEmpty(prev);
    };

    const clearFlags: MetadataClearFlags = Object.fromEntries(this.topLevelFields().map(field => [field.name, wasCleared(field.name)]));

    return {metadata, clearFlags};
  }

  private updateMetadata(shouldLockAllFields: boolean | undefined): void {
    const metadataUpdateWrapper = this.buildMetadataWrapper(shouldLockAllFields);
    this.bookMetadataManageService
      .updateBookMetadata(this.currentBookId, metadataUpdateWrapper, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (shouldLockAllFields !== undefined) {
            this.messageService.add({
              severity: "success",
              summary: shouldLockAllFields
                ? this.t.translate('metadata.editor.toast.metadataLocked')
                : this.t.translate('metadata.editor.toast.metadataUnlocked'),
              detail: shouldLockAllFields
                ? this.t.translate('metadata.editor.toast.allFieldsLocked')
                : this.t.translate('metadata.editor.toast.allFieldsUnlocked'),
            });
          }
        },
        error: () => {
          this.messageService.add({
            severity: "error",
            summary: this.t.translate('metadata.editor.toast.errorSummary'),
            detail: this.t.translate('metadata.editor.toast.lockStateFailed'),
          });
        },
      });
  }

  getUploadCoverUrl(): string {
    return this.bookMetadataManageService.getUploadCoverUrl(this.currentBookId);
  }

  onBeforeSend(): void {
    this.isUploading = true;
  }

  onUpload(event: FileUploadEvent): void {
    const response: HttpResponse<unknown> =
      event.originalEvent as HttpResponse<unknown>;
    if (response?.status === 200) {
      this.isUploading = false;
      this.bookService.handleBookMetadataUpdate(this.currentBookId);
    } else {
      this.isUploading = false;
      this.messageService.add({
        severity: "error",
        summary: this.t.translate('metadata.editor.toast.uploadFailedSummary'),
        detail: this.t.translate('metadata.editor.toast.uploadFailedDetail'),
        life: 3000,
      });
    }
  }

  onUploadError($event: FileUploadErrorEvent) {
    void $event;
    this.isUploading = false;
    this.messageService.add({
      severity: "error",
      summary: this.t.translate('metadata.editor.toast.uploadErrorSummary'),
      detail: this.t.translate('metadata.editor.toast.uploadErrorDetail'),
      life: 3000,
    });
  }

  regenerateCover(bookId: number) {
    this.bookMetadataManageService.regenerateCover(bookId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: "success",
          summary: this.t.translate('metadata.editor.toast.successSummary'),
          detail: this.t.translate('metadata.editor.toast.coverRegenerated'),
        });
      },
      error: (err: unknown) => {
        const errorMessage =
          err && typeof err === 'object' && 'error' in err && err.error &&
          typeof err.error === 'object' && 'message' in err.error &&
          typeof err.error.message === 'string'
            ? err.error.message
            : this.t.translate('metadata.editor.toast.coverRegenFailed');
        this.messageService.add({
          severity: "error",
          summary: this.t.translate('metadata.editor.toast.errorSummary'),
          detail: errorMessage,
        });
      }
    });
  }

  generateCustomCover(bookId: number) {
    this.isGeneratingCover = true;
    this.bookMetadataManageService.generateCustomCover(bookId).pipe(
      finalize(() => this.isGeneratingCover = false),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: "success",
          summary: this.t.translate('metadata.editor.toast.successSummary'),
          detail: this.t.translate('metadata.editor.toast.customCoverGenerated'),
        });
      },
      error: () => {
        this.messageService.add({
          severity: "error",
          summary: this.t.translate('metadata.editor.toast.errorSummary'),
          detail: this.t.translate('metadata.editor.toast.customCoverFailed'),
        });
      }
    });
  }

  regenerateAudiobookCover(bookId: number) {
    this.bookMetadataManageService.regenerateAudiobookCover(bookId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: "success",
          summary: this.t.translate('metadata.editor.toast.successSummary'),
          detail: this.t.translate('metadata.editor.toast.audiobookCoverRegenerated'),
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: "error",
          summary: this.t.translate('metadata.editor.toast.errorSummary'),
          detail: err?.error?.message || this.t.translate('metadata.editor.toast.audiobookCoverRegenFailed'),
        });
      }
    });
  }

  generateCustomAudiobookCover(bookId: number) {
    this.isGeneratingAudiobookCover = true;
    this.bookMetadataManageService.generateCustomAudiobookCover(bookId).pipe(
      finalize(() => this.isGeneratingAudiobookCover = false),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: "success",
          summary: this.t.translate('metadata.editor.toast.successSummary'),
          detail: this.t.translate('metadata.editor.toast.customAudiobookCoverGenerated'),
        });
      },
      error: () => {
        this.messageService.add({
          severity: "error",
          summary: this.t.translate('metadata.editor.toast.errorSummary'),
          detail: this.t.translate('metadata.editor.toast.customAudiobookCoverFailed'),
        });
      }
    });
  }

  autoFetch(bookId: number) {
    this.refreshingBookIds.add(bookId);
    this.isAutoFetching = true;

    this.taskHelperService.refreshMetadataTask({
      refreshType: MetadataRefreshType.BOOKS,
      bookIds: [bookId],
    }).subscribe({
      next: () => {
        this.isAutoFetching = false;
      },
      error: () => {
        this.isAutoFetching = false;
      },
      complete: () => {
        this.isAutoFetching = false;
        this.refreshingBookIds.delete(bookId);
      }
    });

    setTimeout(() => {
      this.isAutoFetching = false;
      this.refreshingBookIds.delete(bookId);
    }, 15000);
  }

  async fetchFromFile(bookId: number): Promise<void> {
    this.isFetchingFromFile = true;
    try {
      this.populateFormFromMetadata(await this.queryClient.query(this.sources.fileMetadata(bookId)));
      this.metadataForm.markAsDirty();
      this.messageService.add({
        severity: 'info',
        summary: this.t.translate('metadata.editor.toast.successSummary'),
        detail: this.t.translate('metadata.editor.toast.fileMetadataLoaded'),
      });
    } catch (err) {
      const message: unknown = err instanceof HttpErrorResponse ? err.error?.message : null;
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('metadata.editor.toast.errorSummary'),
        detail: typeof message === 'string' ? message : this.t.translate('metadata.editor.toast.fileMetadataFailed'),
      });
    } finally {
      this.isFetchingFromFile = false;
    }
  }

  onNext() {
    if (this.autoSaveEnabled && this.metadataForm.dirty) {
      this.saveMetadata().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.nextBookClicked.emit());
    } else {
      this.nextBookClicked.emit();
    }
  }

  onPrevious() {
    if (this.autoSaveEnabled && this.metadataForm.dirty) {
      this.saveMetadata().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.previousBookClicked.emit());
    } else {
      this.previousBookClicked.emit();
    }
  }

  closeDialog() {
    this.closeDialogButtonClicked.emit();
  }

  async openCoverSearch() {
    const ref = await this.bookDialogHelperService.openCoverSearchDialog(this.currentBookId, 'ebook');
    ref?.onClose.pipe(
      take(1),
      filter(result => !!result),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  navigatePrevious(): void {
    const prevBookId = this.bookNavigationService.previousBookId();
    if (prevBookId) {
      if (this.autoSaveEnabled && this.metadataForm.dirty) {
        this.saveMetadata().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.navigateToBook(prevBookId));
      } else {
        this.navigateToBook(prevBookId);
      }
    }
  }

  navigateNext(): void {
    const nextBookId = this.bookNavigationService.nextBookId();
    if (nextBookId) {
      if (this.autoSaveEnabled && this.metadataForm.dirty) {
        this.saveMetadata().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.navigateToBook(nextBookId));
      } else {
        this.navigateToBook(nextBookId);
      }
    }
  }

  private navigateToBook(bookId: number): void {
    this.bookNavigationService.updateCurrentBook(bookId);
    if (this.metadataCenterViewMode === 'route') {
      this.router.navigate(['/book', bookId], {
        queryParams: {tab: 'edit'}
      });
    } else {
      this.metadataHostService.switchBook(bookId);
    }
  }

  isFieldVisible(field: keyof MetadataProviderSpecificFields): boolean {
    return this.providerSpecificFields()[field];
  }

  protected readonly sample = sample;

  onFieldChange(): void {
    this.metadataForm.markAsDirty();
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
    return this.bookMetadataManageService.supportsDualCovers(book);
  }

  isCBX(book: Book): boolean {
    return book.primaryFile?.bookType === 'CBX';
  }

  isAudiobook(book: Book): boolean {
    return book.primaryFile?.bookType === 'AUDIOBOOK';
  }

  getUploadAudiobookCoverUrl(): string {
    return this.bookMetadataManageService.getUploadAudiobookCoverUrl(this.currentBookId);
  }

  async openAudiobookCoverSearch() {
    const ref = await this.bookDialogHelperService.openCoverSearchDialog(this.currentBookId, 'audiobook');
    ref?.onClose.pipe(
      take(1),
      filter(result => !!result),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  onAudiobookCoverUpload(event: FileUploadEvent): void {
    const response: HttpResponse<unknown> =
      event.originalEvent as HttpResponse<unknown>;
    if (response?.status === 200) {
      this.isUploading = false;
      this.bookService.handleBookMetadataUpdate(this.currentBookId);
    } else {
      this.isUploading = false;
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('metadata.editor.toast.uploadFailedSummary'),
        detail: this.t.translate('metadata.editor.toast.audiobookUploadFailed'),
        life: 3000,
      });
    }
  }
}
