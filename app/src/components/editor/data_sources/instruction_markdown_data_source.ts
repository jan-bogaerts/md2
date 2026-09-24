import type { DataService } from '../../../services/data/data_service'
import { agentInstructionsService } from '../../../services/agent_instructions/agent_instructions_service'
import { dialogService } from '../../../services/dialog_service'
import {
    openFilesService,
    type InstructionOpenDocument,
    type OpenDocumentChangedDetail,
    type OpenFilesService,
} from '../../../services/open_files_service'
import { projectAccessService } from '../../../services/project/project_access_service'
import {
    MarkdownDataSourceBase,
    type MarkdownBindingKind,
    type MarkdownDocumentTarget,
} from './markdown_data_source'

type InstructionPersistence = Pick<DataService, 'scheduleFileCommit'>
type InstructionDocumentOwner = EventTarget & Pick<OpenFilesService, 'getSnapshot'>

function instructionTarget(target: MarkdownDocumentTarget): asserts target is { document: InstructionOpenDocument } {
    if (target.document.kind !== 'instruction') throw new Error('Instruction Markdown source requires an instruction document')
}

function readInstructionMarkdown(target: MarkdownDocumentTarget) {
    instructionTarget(target)

    return target.document.getDraft().content
}

function editInstructionMarkdown(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
    if (binding !== 'list-instruction') throw new Error('Instruction Markdown source requires list-instruction binding')
    instructionTarget(target)
    projectAccessService.requireWritable()
    agentInstructionsService.updateContent(target.document.path, markdown, () => {
        if (target.document.getDraft().content !== markdown) target.document.updateDraft({ content: markdown }, binding)
    })
}

/** Reads and writes agent-instruction Markdown through its owning service. */
export class InstructionMarkdownDataSource extends MarkdownDataSourceBase {
    private documentOwner: InstructionDocumentOwner | null = null
    private persistence: InstructionPersistence | null = null

    init(persistence: InstructionPersistence, documentOwner: InstructionDocumentOwner = openFilesService) {
        if (this.persistence === persistence && this.documentOwner === documentOwner) return
        if (this.documentOwner) {
            this.documentOwner.removeEventListener('changed', this.handleOpenFilesChanged)
            this.documentOwner.removeEventListener('documentChanged', this.handleDocumentChanged)
        }

        this.persistence = persistence
        this.documentOwner = documentOwner
        documentOwner.addEventListener('changed', this.handleOpenFilesChanged)
        documentOwner.addEventListener('documentChanged', this.handleDocumentChanged)
        this.syncBinding()
    }

    readonly getMarkdown = readInstructionMarkdown
    readonly edit = editInstructionMarkdown

    commit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
        try {
            this.edit(binding, target, markdown)
            const persistence = this.requirePersistence()
            const file = agentInstructionsService.getFile(target.document.path)
            if (!file) throw new Error(`Cannot save missing agent instruction: ${target.document.path}`)
            persistence.scheduleFileCommit(file, `Update ${file.path}`, target.document.createSaveReference())

            return true
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Agent instruction update failed: ${target.document.path}` })

            return false
        }
    }

    private readonly handleOpenFilesChanged = () => this.syncBinding()

    private readonly handleDocumentChanged = (event: Event) => {
        const { document, origin, type } = (event as CustomEvent<OpenDocumentChangedDetail>).detail
        if (document.kind !== 'instruction') return
        if (type === 'renewed') {
            this.dispatchEvent(new Event('instructionsChanged'))
            return
        }
        if (type !== 'draft') return

        const originBinding = origin === 'list-instruction' ? origin : null
        this.dispatchMarkdownReplaced({ originBinding, target: { document } })
    }

    private syncBinding() {
        const activeDocument = this.documentOwner?.getSnapshot().activeDocument ?? null
        this.setActiveTarget(
            'list-instruction',
            activeDocument?.kind === 'instruction' ? { document: activeDocument } : null,
        )
    }

    private requirePersistence() {
        if (!this.persistence) throw new Error('Instruction Markdown data source is not initialized')

        return this.persistence
    }
}

export const instructionMarkdownDataSource = new InstructionMarkdownDataSource()
