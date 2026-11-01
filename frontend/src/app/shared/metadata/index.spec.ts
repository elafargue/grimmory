import {describe, expect, it} from 'vitest';

import * as metadataIndex from './index';
import {BOOK_FIELDS} from './metadata-fields';

describe('shared metadata index', () => {
  it('re-exports the metadata field list', () => {
    expect(metadataIndex.BOOK_FIELDS).toBe(BOOK_FIELDS);
  });
});
