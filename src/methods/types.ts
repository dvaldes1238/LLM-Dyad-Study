export enum MethodType {
    EACH_PARTICIPANT_SIMULTANEOUS = 'EACH_PARTICIPANT_SIMULTANEOUS',
    EACH_PARTICIPANT_ALONE = 'EACH_PARTICIPANT_ALONE',
    EACH_TURN_ALONE = 'EACH_TURN_ALONE',
}

export type MethodResultType = Record<string, string | number | boolean | undefined>;