import { describe, expect, it } from 'vitest'
import { serializeStatsCsv } from './stats_csv'

describe('serializeStatsCsv', () => {
    it('exports exact filtered chart rows as RFC 4180 with UTC and stable identity fields', () => {
        expect(serializeStatsCsv('totals', [{
            displayLabel: 'F_1: Review, "carefully"',
            grouping: 'card',
            identity: 'card-1',
            metric: 'tokens',
            unit: 'tokens',
            utcBucketStart: null,
            value: 42,
        }])).toBe([
            'dataset,grouping,utc_bucket_start,identity,display_label,metric,unit,value',
            'totals,card,,card-1,"F_1: Review, ""carefully""",tokens,tokens,42',
            '',
        ].join('\r\n'))
    })
})
