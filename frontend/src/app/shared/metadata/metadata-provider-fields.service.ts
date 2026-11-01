import {computed, inject, Service} from '@angular/core';

import {MetadataCatalogService} from './metadata-catalog.service';
import {providerFieldsOf, providerScoreFieldsOf} from './metadata-provider-fields';

@Service()
export class MetadataProviderFieldsService {
  private readonly catalog = inject(MetadataCatalogService);

  readonly fields = computed(() => providerFieldsOf(this.catalog.providers()));

  readonly scoreFields = computed(() => providerScoreFieldsOf(this.fields()));
}
