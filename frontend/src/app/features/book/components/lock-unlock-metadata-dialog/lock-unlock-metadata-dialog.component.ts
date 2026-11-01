import {Component, inject, OnInit} from '@angular/core';
import {Button} from '@openng/optimus-ui/button';
import {FormsModule} from '@angular/forms';

import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {MessageService} from '@openng/optimus-ui/api';
import {BookMetadataManageService} from '../../service/book-metadata-manage.service';
import {Divider} from '@openng/optimus-ui/divider';
import {LoadingService} from '../../../../core/services/loading.service';
import {finalize} from 'rxjs';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {BOOK_LOCKS, MetadataFieldLabelService, MetadataProviderFieldsService, type BookLockName, type MetadataLock, type MetadataProviderField} from '../../../../shared/metadata';

@Component({
  selector: 'app-lock-unlock-metadata-dialog',
  standalone: true,
  imports: [
    Button,
    FormsModule,
    Divider,
    TranslocoDirective
],
  templateUrl: './lock-unlock-metadata-dialog.component.html',
  styleUrl: './lock-unlock-metadata-dialog.component.scss'
})
export class LockUnlockMetadataDialogComponent implements OnInit {
  private readonly bookMetadataManageService = inject(BookMetadataManageService);
  private readonly dynamicDialogConfig = inject(DynamicDialogConfig);
  dialogRef = inject(DynamicDialogRef);
  private readonly messageService = inject(MessageService);
  private readonly loadingService = inject(LoadingService);
  private readonly t = inject(TranslocoService);
  private readonly providerFields = inject(MetadataProviderFieldsService);
  protected readonly fieldLabels = inject(MetadataFieldLabelService);
  fieldLocks: Record<string, boolean | undefined> = {};

  bookIds: Set<number> = this.dynamicDialogConfig.data.bookIds;

  readonly locks: readonly (MetadataLock<BookLockName> | MetadataProviderField)[] = [...BOOK_LOCKS, ...this.providerFields.fields()];

  isSaving = false;

  ngOnInit(): void {
    this.locks.forEach(lock => this.fieldLocks[lock.lockName] = undefined);
  }

  toggleLockAll(action: 'LOCK' | 'UNLOCK'): void {
    const lockState = action === 'LOCK' ? true : false;
    this.locks.forEach(lock => {
      this.fieldLocks[lock.lockName] = lockState;
    });
  }

  getLockLabel(field: string): string {
    const state = this.fieldLocks[field];
    if (state === undefined) return this.t.translate('book.lockUnlockDialog.unselected');
    return state ? this.t.translate('book.lockUnlockDialog.locked') : this.t.translate('book.lockUnlockDialog.unlocked');
  }

  getLockIcon(field: string): string {
    const state = this.fieldLocks[field];
    return state === undefined ? '' : state ? 'pi pi-lock' : 'pi pi-lock-open';
  }

  resetFieldLocks(): void {
    this.locks.forEach(lock => {
      this.fieldLocks[lock.lockName] = undefined;
    });
  }

  cycleLockState(field: string): void {
    const current = this.fieldLocks[field];
    if (current === undefined) {
      this.fieldLocks[field] = true;
    } else if (current) {
      this.fieldLocks[field] = false;
    } else {
      this.fieldLocks[field] = undefined;
    }
  }

  applyFieldLocks(): void {
    const fieldActions: Record<string, 'LOCK' | 'UNLOCK'> = {};
    for (const [field, locked] of Object.entries(this.fieldLocks)) {
      if (locked !== undefined) {
        fieldActions[field] = locked ? 'LOCK' : 'UNLOCK';
      }
    }

    this.isSaving = true;
    const loader = this.loadingService.show(this.t.translate('book.lockUnlockDialog.toast.updatingFieldLocks'));

    this.bookMetadataManageService.toggleFieldLocks(this.bookIds, fieldActions)
      .pipe(finalize(() => {
        this.isSaving = false;
        this.loadingService.hide(loader);
      }))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.t.translate('book.lockUnlockDialog.toast.updatedSummary'),
            detail: this.t.translate('book.lockUnlockDialog.toast.updatedDetail')
          });
          this.dialogRef.close('fields-updated');
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('book.lockUnlockDialog.toast.failedSummary'),
            detail: this.t.translate('book.lockUnlockDialog.toast.failedDetail')
          });
        }
      });
  }
}
