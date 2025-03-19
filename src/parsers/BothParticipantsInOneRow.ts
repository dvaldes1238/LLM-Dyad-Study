import { BothParticipantsInOneRowColumnMap, Turn } from "../types";

export const BothParticipantsInOneRowParser = () => {
    return {
        parseRow: (map: BothParticipantsInOneRowColumnMap, row: Record<string, string>, emptyUndefinedOrNaValuesCount: Record<keyof Turn, number>): Turn[] => {
            const participants = ['A', 'B'] as const;
            const turns = participants.map(participant => {
                const columns = participant === 'A' ? map.participantAColumns : map.participantBColumns;
                const ordinality = Number(row[columns.ordinalityColumnName]);
                const transcript = row[columns.transcriptColumnName];
                const toPredict = row[columns.toPredictColumnName];

                if (isNaN(ordinality)) {
                    emptyUndefinedOrNaValuesCount.ordinality++;
                }
                if (transcript === '' || transcript === undefined) {
                    emptyUndefinedOrNaValuesCount.transcript++;
                }
                if (toPredict === '' || toPredict === undefined) {
                    emptyUndefinedOrNaValuesCount.toPredict++;
                }

                return {
                    participant,
                    ordinality: ordinality || 0,
                    transcript: transcript || '',
                    toPredict: toPredict || ''
                };
            });

            return turns;
        }
    }
}