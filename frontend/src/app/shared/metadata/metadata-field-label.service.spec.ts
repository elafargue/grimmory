import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideTransloco, TranslocoService} from '@jsverse/transloco';
import {beforeEach, describe, expect, it} from 'vitest';

import {EN_TRANSLATIONS} from '../../core/config/transloco-loader';
import {MetadataFieldLabelService} from './metadata-field-label.service';
import {BOOK_LOCKS, COMIC_FIELDS} from './metadata-fields';
import {MetadataProviderFieldsService} from './metadata-provider-fields.service';

describe('MetadataFieldLabelService', () => {
  let labels: MetadataFieldLabelService;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTransloco({config: {availableLangs: ['en', 'de'], defaultLang: 'en'}}),
      ],
    });
    transloco = TestBed.inject(TranslocoService);
    transloco.setTranslation(EN_TRANSLATIONS, 'en');
    labels = TestBed.inject(MetadataFieldLabelService);
  });

  it('labels book, cover and provider fields', () => {
    expect(labels.label('categories')).toBe('Genres');
    expect(labels.label('cover')).toBe('Cover');
    expect(labels.label('ebookCover')).toBe('Ebook Cover');
    expect(labels.label('audiobookCover')).toBe('Audiobook Cover');
    expect(labels.label('goodreadsId')).toBe('Goodreads ID');
  });

  it('has an English label for every field', () => {
    const names = [
      ...BOOK_LOCKS.map(lock => lock.name),
      ...COMIC_FIELDS.map(field => field.name),
      ...TestBed.inject(MetadataProviderFieldsService).fields().map(field => field.name),
    ];

    expect(names.filter(name => labels.label(name).startsWith('metadata.'))).toEqual([]);
    expect(Object.values(labels.options()).flatMap(options => options ?? [])
      .filter(option => option.label.startsWith('metadata.'))).toEqual([]);
  });

  it('relabels allowed values when the language changes', () => {
    expect(labels.options()['contentRating']?.[0]).toEqual({label: 'Everyone', value: 'EVERYONE'});

    transloco.setTranslation({metadata: {fieldValues: {contentRating: {EVERYONE: 'Alle'}}}}, 'de');
    transloco.setActiveLang('de');

    expect(labels.options()['contentRating']?.[0]).toEqual({label: 'Alle', value: 'EVERYONE'});
  });
});
