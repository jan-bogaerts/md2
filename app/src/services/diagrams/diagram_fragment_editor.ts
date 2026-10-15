import type { DiagramSequenceFragment, DiagramSequenceFragmentRegion, DiagramSequenceOperator } from './diagram_data'
import { DiagramEditContext } from './diagram_edit_context'
import { collectionMembershipEvent, fragmentRegionMembershipEvent, type PendingMembershipEvent } from './diagram_edit_membership_events'
import { invalidDiagramField } from './diagram_edit_validation'
import { planFragmentUpdate } from './diagram_fragment_update_plan'
import type { NewDiagramSequenceFragment } from './diagram_edit_types'

function frozenIds<Item extends { id: string }>(items: readonly Item[]) {
    return Object.freeze(items.map(({ id }) => id))
}

function sameOrderedValues<Value>(left: readonly Value[], right: readonly Value[]) {
    return left.length === right.length && left.every((value, index) => value === right[index])
}

/** Edits the session-owned canonical diagram. */
export class DiagramFragmentEditor {
    private readonly context: DiagramEditContext

    constructor(context: DiagramEditContext) { this.context = context }

    /** Validates one complete fragment edit before applying its field and ordered-membership changes atomically. */
    updateFragment(fragmentId: string, candidate: NewDiagramSequenceFragment): boolean {
        const fragment = this.context.getFragment(fragmentId)
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.context.validateOperation('Update fragment', () => {
            this.context.validation.validateFragment(candidate, `fragments.${fragmentId}`)
            regions = this.requireOwnedRegions(candidate.operator, candidate.regions, `fragments.${fragmentId}.regions`)
        })) return false
        const plan = planFragmentUpdate(fragment, candidate.operator, regions)
        if (!plan) return false

        const { operatorChanged, changedRegionIndexes, previousOperator, previousRegions } = plan
        fragment.operator = candidate.operator
        for (let index = 0; index < regions.length; index += 1) {
            const region = regions[index]
            const existingRegion = fragment.regions[index]
            if (!existingRegion) {
                fragment.regions.push(region)
                continue
            }
            existingRegion.guard = region.guard
            existingRegion.edgeIds.splice(0, existingRegion.edgeIds.length, ...region.edgeIds)
        }
        if (fragment.regions.length > regions.length) fragment.regions.splice(regions.length)

        const events: PendingMembershipEvent[] = []
        if (operatorChanged) this.context.changeRegistry.markFragmentFieldChange(fragmentId, 'operator', candidate.operator)
        for (const regionIndex of changedRegionIndexes) {
            const previousRegion = previousRegions[regionIndex]
            const region = fragment.regions[regionIndex]
            const previousEdgeIds = previousRegion?.edgeIds ?? []
            const edgeIds = region?.edgeIds ?? []
            const addedIds = edgeIds.filter((edgeId) => !previousEdgeIds.includes(edgeId))
            const removedIds = previousEdgeIds.filter((edgeId) => !edgeIds.includes(edgeId))
            if (previousRegion?.guard !== region?.guard) {
                this.context.changeRegistry.markFragmentRegionFieldChange(fragmentId, regionIndex, 'guard', region?.guard)
            }
            if (!sameOrderedValues(previousEdgeIds, edgeIds)) {
                for (const edgeId of addedIds) {
                    this.context.changeRegistry.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, true)
                }
                for (const edgeId of removedIds) {
                    this.context.changeRegistry.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, false)
                }
                this.context.changeRegistry.markFragmentRegionFieldChange(fragmentId, regionIndex, 'edgeIds', edgeIds)
                events.push(fragmentRegionMembershipEvent(fragmentId, regionIndex, addedIds, removedIds))
            }
        }
        this.context.transaction.commit(events)
        if (operatorChanged) this.context.transaction.publishFragmentFieldChange(fragmentId, 'operator', previousOperator, candidate.operator)
        for (const regionIndex of changedRegionIndexes) {
            const previousRegion = previousRegions[regionIndex]
            const region = fragment.regions[regionIndex]
            if (previousRegion?.guard !== region?.guard) {
                this.context.transaction.publishFragmentRegionFieldChange(fragmentId, regionIndex, 'guard', previousRegion?.guard, region?.guard)
            }
        }

        return true
    }

    createFragment(fragment: NewDiagramSequenceFragment): string | null {
        const diagram = this.context.diagram
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.context.validateOperation('Create fragment', () => {
            this.context.validation.validateNewFragment(fragment)
            regions = this.requireOwnedRegions(fragment.operator, fragment.regions)
        })) return null
        const id = this.context.generateObjectId((candidate) => this.context.hasFragment(candidate))
        const created: DiagramSequenceFragment = { id, operator: fragment.operator, regions }
        if (!diagram.fragments) diagram.fragments = []
        diagram.fragments.push(created)
        this.context.addFragment(created)
        this.context.setFragmentIds(frozenIds(diagram.fragments))
        this.context.changeRegistry.markCollectionMembership('fragment', id, true)
        this.context.transaction.commit([collectionMembershipEvent('fragment', [id], [])])

        return id
    }

    /** Removes a fragment only; the edges its regions referenced stay in the diagram. */
    removeFragment(fragmentId: string): boolean {
        const diagram = this.context.diagram
        const fragment = this.context.hasFragment(fragmentId) ? this.context.getFragment(fragmentId) : null
        if (!fragment || !diagram.fragments) return false

        diagram.fragments.splice(diagram.fragments.indexOf(fragment), 1)
        this.context.deleteFragment(fragmentId)
        this.context.setFragmentIds(frozenIds(diagram.fragments))
        this.context.changeRegistry.purgeOwner(`fragment:${fragmentId}`)
        this.context.changeRegistry.markCollectionMembership('fragment', fragmentId, false)
        this.context.transaction.commit([collectionMembershipEvent('fragment', [], [fragmentId])])

        return true
    }

    private requireOwnedRegions(
        operator: DiagramSequenceOperator,
        regions: readonly DiagramSequenceFragmentRegion[],
        fieldPath = 'fragments.new.regions',
    ) {
        const requiredRegionCount = operator === 'alt' ? 2 : 1
        if (regions.length !== requiredRegionCount) invalidDiagramField(fieldPath, `expected ${requiredRegionCount} regions`)
        const seenEdgeIds = new Set<string>()

        return regions.map((region, regionIndex): DiagramSequenceFragmentRegion => ({
            edgeIds: region.edgeIds.map((edgeId) => {
                if (!this.context.hasEdge(edgeId)) invalidDiagramField(`${fieldPath}[${regionIndex}].edgeIds`, `unknown edge ${edgeId}`)
                if (seenEdgeIds.has(edgeId)) invalidDiagramField(fieldPath, `duplicate edge ${edgeId}`)
                seenEdgeIds.add(edgeId)

                return edgeId
            }),
            guard: region.guard,
        }))
    }

}
