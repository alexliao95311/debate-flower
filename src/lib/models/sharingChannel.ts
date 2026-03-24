import { sendWsAction } from './wsRoom';
import type { ActionBundle } from './nodeAction';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sendActionBundle(actionBundle: ActionBundle, _inverseActionBundle: ActionBundle) {
	sendWsAction(actionBundle);
}
