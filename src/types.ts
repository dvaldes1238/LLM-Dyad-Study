import { Static, Type } from "@sinclair/typebox";

export const Turn = Type.Object({
    participant: Type.Union([Type.Literal('A'), Type.Literal('B')]),
    ordinality: Type.Number(),
    transcript: Type.String(),
    toPredict: Type.String()
})

export const EmptyUndefinedOrNaValuesCount = Type.Object({
    participant: Type.Number(),
    ordinality: Type.Number(),
    transcript: Type.Number(),
    toPredict: Type.Number()
})

export const Dyad = Type.Object({
    dyadId: Type.String(),
    turns: Type.Array(Turn),
    emptyUndefinedOrNaValuesCount: EmptyUndefinedOrNaValuesCount
})

export enum ColumnMapTypeEnum {
    BOTH_PARTICIPANTS_IN_ONE_ROW = 'BOTH_PARTICIPANTS_IN_ONE_ROW',
    EACH_PARTICIPANT_IN_SEPERATE_ROWS = 'EACH_PARTICIPANT_IN_SEPERATE_ROWS'
}

export const ColumnMapType = Type.Union([
    ...Object.values(ColumnMapTypeEnum).map(v => Type.Literal(v))
]);

export const BothParticipantsInOneRowColumnMap = Type.Object({
    type: Type.Literal(ColumnMapTypeEnum.BOTH_PARTICIPANTS_IN_ONE_ROW),

    dyadIdColumnName: Type.String(),

    participantAColumns: Type.Object({
        ordinalityColumnName: Type.String(),
        transcriptColumnName: Type.String(),
        toPredictColumnName: Type.String()
    }),

    participantBColumns: Type.Object({
        ordinalityColumnName: Type.String(),
        transcriptColumnName: Type.String(),
        toPredictColumnName: Type.String()
    })
});

export const EachParticipantInSeperateRowsColumnMap = Type.Object({
    type: Type.Literal(ColumnMapTypeEnum.EACH_PARTICIPANT_IN_SEPERATE_ROWS),

    dyadIdColumnName: Type.String(),

    participantDiscriminatorColumnName: Type.String(),

    participantAColumns: Type.Object({
        discriminatorValue: Type.String(),

        ordinalityColumnName: Type.String(),
        transcriptColumnName: Type.String(),
        toPredictColumnName: Type.String()
    }),

    participantBColumns: Type.Object({
        discriminatorValue: Type.String(),

        ordinalityColumnName: Type.String(),
        transcriptColumnName: Type.String(),
        toPredictColumnName: Type.String()
    })
});

export const ColumnMap = Type.Union([
    BothParticipantsInOneRowColumnMap,
    EachParticipantInSeperateRowsColumnMap
]);

export type Turn = Static<typeof Turn>
export type EmptyUndefinedOrNaValuesCount = Static<typeof EmptyUndefinedOrNaValuesCount>
export type Dyad = Static<typeof Dyad>

export type ColumnMapType = Static<typeof ColumnMapType>;
export type ColumnMap = Static<typeof ColumnMap>;

export type BothParticipantsInOneRowColumnMap = Static<typeof BothParticipantsInOneRowColumnMap>;
export type EachParticipantInSeperateRowsColumnMap = Static<typeof EachParticipantInSeperateRowsColumnMap>;