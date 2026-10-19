import { getElectronActionBridge, type ElectronActionBridge, type SequenceScheduleRegistrationRequest } from '../../../../data/electron_action_bridge'
import { activeScheduleService, type ActiveScheduleService } from '../../../../services/actions/active_schedule_service'
import { projectAccessService } from '../../../../services/project/project_access_service'

interface CardSequenceRegistrationDependencies {
    activeScheduleService: Pick<ActiveScheduleService, 'applySchedule'>
    bridge: ElectronActionBridge | null
}

/**
 * Register one sequence and apply the persisted schedule to renderer state. Resolves once the schedule is persisted;
 * activation continues in Electron and reports its outcome through later schedule updates.
 */
export async function registerCardSequence(
    request: SequenceScheduleRegistrationRequest,
    dependencies: CardSequenceRegistrationDependencies = {
        activeScheduleService,
        bridge: getElectronActionBridge(),
    },
) {
    projectAccessService.requireWritable()
    if (!dependencies.bridge?.registerSequenceSchedule) {
        throw new Error('Card sequences require Electron local mode')
    }

    const schedule = await dependencies.bridge.registerSequenceSchedule(request)
    dependencies.activeScheduleService.applySchedule(schedule)
}
