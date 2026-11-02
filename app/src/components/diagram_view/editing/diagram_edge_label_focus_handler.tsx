import { useEffect, useSyncExternalStore } from 'react';
import {
    diagramLabelFocusService, type DiagramLabelFocusService,
} from '../../../services/diagrams/diagram_label_focus_service';
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from '../details/diagram_object_details_service';

/** Opens details when a newly created edge is waiting for its label input. */
export function DiagramEdgeLabelFocusHandler({
    details = diagramObjectDetailsService,
    labelFocus = diagramLabelFocusService,
}: {
    details?: DiagramObjectDetailsService;
    labelFocus?: DiagramLabelFocusService;
}) {
    const target = useSyncExternalStore(
        labelFocus.subscribeTarget,
        labelFocus.getTargetSnapshot,
        labelFocus.getTargetSnapshot,
    );

    useEffect(() => {
        if (target?.objectKind !== 'edge') return;

        details.open(target);
    }, [details, target]);

    return null;
}
