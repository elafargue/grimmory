import type {BookDetailComicMetadata, BookDetailMetadata} from '../../features/book/data/book-response.models';
import type {BookQueryFacetKey} from '../../features/book/data/book-query-params';
import type {MetadataProviderFieldName} from './metadata-providers';

export type MetadataFieldValueType = 'string' | 'text' | 'date' | 'number' | 'boolean' | 'array';

export interface MetadataLock<Name extends string = string> {
  readonly name: Name;
  readonly lockName: `${Name}Locked`;
}

export interface MetadataField<Name extends string = string> extends MetadataLock<Name> {
  readonly valueType: MetadataFieldValueType;
}

type LockedFieldsOf<Model> = Extract<keyof Model, `${string}Locked`> extends `${infer Name}Locked` ? Name : never;

interface BookFieldFacts {
  readonly suggestions?: BookQueryFacetKey;
  readonly fetchable?: true;
}

interface ComicFieldFacts {
  readonly suggestions?: BookQueryFacetKey;
}

type BookLockableName = Exclude<LockedFieldsOf<BookDetailMetadata>, MetadataProviderFieldName>;
type ComicLockableName = Exclude<LockedFieldsOf<BookDetailComicMetadata>, LockedFieldsOf<BookDetailMetadata>>;

const BOOK_FIELD_TABLE = [
  {name: 'title', valueType: 'string', fetchable: true},
  {name: 'subtitle', valueType: 'string', fetchable: true},
  {name: 'authors', valueType: 'array', fetchable: true, suggestions: 'author'},
  {name: 'publisher', valueType: 'string', fetchable: true, suggestions: 'publisher'},
  {name: 'publishedDate', valueType: 'date', fetchable: true},
  {name: 'categories', valueType: 'array', fetchable: true, suggestions: 'genre'},
  {name: 'moods', valueType: 'array', fetchable: true, suggestions: 'mood'},
  {name: 'tags', valueType: 'array', fetchable: true, suggestions: 'tag'},
  {name: 'description', valueType: 'text', fetchable: true},
  {name: 'seriesName', valueType: 'string', fetchable: true, suggestions: 'series'},
  {name: 'seriesNumber', valueType: 'number', fetchable: true},
  {name: 'seriesTotal', valueType: 'number', fetchable: true},
  {name: 'language', valueType: 'string', fetchable: true},
  {name: 'isbn10', valueType: 'string', fetchable: true},
  {name: 'isbn13', valueType: 'string', fetchable: true},
  {name: 'pageCount', valueType: 'number', fetchable: true},
  {name: 'ageRating', valueType: 'number'},
  {name: 'contentRating', valueType: 'string'},
  {name: 'narrator', valueType: 'string'},
  {name: 'abridged', valueType: 'boolean'},
] as const satisfies readonly (BookFieldFacts & {readonly name: BookLockableName; readonly valueType: MetadataFieldValueType})[];

const BOOK_LOCK_ONLY = ['cover', 'audiobookCover', 'reviews'] as const satisfies readonly BookLockableName[];

export const FIELD_OPTIONS = {
  ageRating: [0, 6, 10, 13, 16, 18, 21],
  contentRating: ['EVERYONE', 'TEEN', 'MATURE', 'ADULT', 'EXPLICIT'],
} as const satisfies Partial<Record<BookLockableName, readonly (string | number)[]>>;

const COMIC_FIELD_TABLE = [
  {name: 'issueNumber', valueType: 'string'},
  {name: 'volumeName', valueType: 'string'},
  {name: 'volumeNumber', valueType: 'number'},
  {name: 'storyArc', valueType: 'string'},
  {name: 'storyArcNumber', valueType: 'number'},
  {name: 'alternateSeries', valueType: 'string'},
  {name: 'alternateIssue', valueType: 'string'},
  {name: 'imprint', valueType: 'string'},
  {name: 'format', valueType: 'string'},
  {name: 'readingDirection', valueType: 'string'},
  {name: 'webLink', valueType: 'string'},
  {name: 'blackAndWhite', valueType: 'boolean'},
  {name: 'manga', valueType: 'boolean'},
  {name: 'pencillers', valueType: 'array'},
  {name: 'inkers', valueType: 'array'},
  {name: 'colorists', valueType: 'array'},
  {name: 'letterers', valueType: 'array'},
  {name: 'coverArtists', valueType: 'array'},
  {name: 'editors', valueType: 'array'},
  {name: 'characters', valueType: 'array', suggestions: 'comic_character'},
  {name: 'teams', valueType: 'array', suggestions: 'comic_team'},
  {name: 'locations', valueType: 'array', suggestions: 'comic_location'},
  {name: 'notes', valueType: 'text'},
] as const satisfies readonly (ComicFieldFacts & {readonly name: ComicLockableName; readonly valueType: MetadataFieldValueType})[];

export type BookFieldName = (typeof BOOK_FIELD_TABLE)[number]['name'];
export type ComicFieldName = (typeof COMIC_FIELD_TABLE)[number]['name'];
export type MetadataFieldName = BookFieldName | ComicFieldName | MetadataProviderFieldName;
export type BookLockName = BookFieldName | (typeof BOOK_LOCK_ONLY)[number];

export interface BookField extends MetadataField<BookFieldName>, BookFieldFacts {}

export interface ComicField extends MetadataField<ComicFieldName>, ComicFieldFacts {}

function lockFor<Name extends string>(name: Name): MetadataLock<Name> {
  return {name, lockName: `${name}Locked`};
}

export const BOOK_FIELDS: readonly BookField[] = BOOK_FIELD_TABLE.map(entry => ({...entry, ...lockFor(entry.name)}));

export function bookFieldsNamed<Name extends BookFieldName>(names: readonly Name[]): readonly (BookField & {readonly name: Name})[] {
  return BOOK_FIELDS.filter((field): field is BookField & {readonly name: Name} => names.some(name => name === field.name));
}

export const FETCHABLE_FIELDS: readonly (BookField & {readonly name: Extract<(typeof BOOK_FIELD_TABLE)[number], {readonly fetchable: true}>['name']})[] =
  BOOK_FIELD_TABLE.flatMap(entry => 'fetchable' in entry ? [{...entry, ...lockFor(entry.name)}] : []);

export const BOOK_NON_FIELD_LOCKS: readonly MetadataLock<BookLockName>[] = BOOK_LOCK_ONLY.map(lockFor);

export const BOOK_LOCKS: readonly MetadataLock<BookLockName>[] = [...BOOK_FIELDS, ...BOOK_NON_FIELD_LOCKS];

export const COMIC_FIELDS: readonly ComicField[] = COMIC_FIELD_TABLE.map(entry => ({...entry, ...lockFor(entry.name)}));
