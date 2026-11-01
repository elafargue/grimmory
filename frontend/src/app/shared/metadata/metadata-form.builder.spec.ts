import {FormControl, FormGroup} from '@angular/forms';
import {describe, expect, it} from 'vitest';

import {MetadataFormBuilder, readFormValue, toFormValue} from './metadata-form.builder';
import {BOOK_FIELDS, COMIC_FIELDS} from './metadata-fields';

describe('MetadataFormBuilder', () => {
  const builder = new MetadataFormBuilder();

  it('builds controls with defaults for the requested fields', () => {
    const form = builder.buildForm([...BOOK_FIELDS, ...COMIC_FIELDS]);

    expect(form.get('title')?.value).toBe('');
    expect(form.get('authors')?.value).toEqual([]);
    expect(form.get('seriesNumber')?.value).toBeNull();
    expect(form.get('titleLocked')?.value).toBe(false);
    expect(form.get('narrator')?.value).toBe('');
    expect(form.get('abridged')?.value).toBeNull();
    expect(form.get('issueNumber')?.value).toBe('');
    expect(form.get('characters')?.value).toEqual([]);
    expect(form.get('thumbnailUrl')).toBeNull();
  });

  it('loads list values in the order given', () => {
    const field = (name: string) => [...BOOK_FIELDS, ...COMIC_FIELDS].find(candidate => candidate.name === name)!;

    expect(toFormValue(field('tags'), ['Zed', 'Amy'])).toEqual(['Zed', 'Amy']);
    expect(toFormValue(field('narrator'), undefined)).toBeNull();
  });

  it('saves form values as the types the backend stores', () => {
    const fields = [...BOOK_FIELDS, ...COMIC_FIELDS];
    const saved = (name: string, value: unknown) => readFormValue(
      new FormGroup({[name]: new FormControl(value)}),
      fields.find(candidate => candidate.name === name)!,
    );

    expect(saved('seriesNumber', '3')).toBe(3);
    expect(saved('volumeNumber', '')).toBeNull();
    expect(saved('pageCount', 'abc')).toBeNull();
    expect(saved('title', '')).toBe('');
    expect(saved('title', null)).toBeNull();
    expect(saved('abridged', true)).toBe(true);
    expect(saved('abridged', null)).toBeNull();
    expect(saved('tags', null)).toEqual([]);
    expect(saved('tags', ['Amy'])).toEqual(['Amy']);
  });

  it('applies lock states after re-enabling unlocked controls first', () => {
    const form = new FormGroup({
      title: new FormControl('Title'),
      titleLocked: new FormControl(false),
      authors: new FormControl<string[]>(['A']),
      authorsLocked: new FormControl(false),
      narrator: new FormControl('Narrator'),
      narratorLocked: new FormControl(false),
      issueNumber: new FormControl('7'),
      issueNumberLocked: new FormControl(false),
    });

    form.get('title')?.disable();
    form.get('authors')?.disable();

    builder.applyLockStates(form, {
      titleLocked: true,
      narratorLocked: true,
      issueNumberLocked: false,
    }, [...BOOK_FIELDS, ...COMIC_FIELDS]);

    expect(form.get('title')?.disabled).toBe(true);
    expect(form.get('authors')?.enabled).toBe(true);
    expect(form.get('narrator')?.disabled).toBe(true);
    expect(form.get('issueNumber')?.enabled).toBe(true);
  });

  it('toggles all locked fields and matching control enabled state together', () => {
    const form = new FormGroup({
      title: new FormControl('Title'),
      titleLocked: new FormControl(false),
      authors: new FormControl<string[]>(['A']),
      authorsLocked: new FormControl(false),
    });

    builder.setAllFieldsLocked(form, true);
    expect(form.get('titleLocked')?.value).toBe(true);
    expect(form.get('authorsLocked')?.value).toBe(true);
    expect(form.get('title')?.disabled).toBe(true);
    expect(form.get('authors')?.disabled).toBe(true);

    builder.setAllFieldsLocked(form, false);
    expect(form.get('titleLocked')?.value).toBe(false);
    expect(form.get('authorsLocked')?.value).toBe(false);
    expect(form.get('title')?.enabled).toBe(true);
    expect(form.get('authors')?.enabled).toBe(true);
  });
});
