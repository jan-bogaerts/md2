import { getElectronActionBridge, type ElectronActionBridge, type SequenceScheduleRegistrationRequest } from '../../../../data/electron_action_bridge'
import { activeScheduleService, type ActiveScheduleService } from '../../../../services/actions/active_schedule_service'
import { projectAccessService } from '../../../../services/project/project_access_service'

interface CardSequenceRegistrationDependencies {
    activeScheduleService: Pick<ActiveScheduleService, 'refresh'>
    bridge: ElectronActionBridge | null
}

/** Register one validated sequence and refresh renderer schedule state after persistence. */
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

    await dependencies.bridge.registerSequenceSchedule(request)
    await dependencies.activeScheduleService.refresh()
}
