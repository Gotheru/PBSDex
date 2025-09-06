import { humanize, normKey } from "../util/fmt";
import { INTL_IDX } from "./data";

export function tTarget(key: string | undefined): string {
    if (!key) return "—";
    return INTL_IDX.moveTargets.get(normKey(key)) || humanize(key);
}

export function tFlag(key: string | undefined): string {
    if (!key) return "—";
    return INTL_IDX.moveFlags.get(normKey(key)) || humanize(key);
}