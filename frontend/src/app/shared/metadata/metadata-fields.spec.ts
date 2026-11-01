import {describe, expect, it} from 'vitest';

import {bookFieldsNamed} from './metadata-fields';

describe('metadata fields', () => {
  it('returns named fields in the shared field order', () => {
    expect(bookFieldsNamed(['language', 'title', 'authors']).map(field => field.name)).toEqual(['title', 'authors', 'language']);
  });
});
