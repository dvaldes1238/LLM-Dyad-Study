import { EachParticipantInSeperateRowsColumnMap, Turn } from "../types";

export const EachParticipantInSeperateRowsParser = () => {
    return {
        parseRow: (map: EachParticipantInSeperateRowsColumnMap, row: Record<string, string>, emptyUndefinedOrNaValuesCount: Record<keyof Turn, number>): Turn[] => {
            const participantDiscriminator = row[map.participantDiscriminatorColumnName];

            // Determine which participant this row belongs to
            const currentParticipant = participantDiscriminator === map.participantAColumns.discriminatorValue ? 'A' :
                participantDiscriminator === map.participantBColumns.discriminatorValue ? 'B' :
                    null;

            if (currentParticipant === null) {
                throw new Error(`Invalid participant discriminator: ${participantDiscriminator}`);
            }

            // Get the columns for the current participant
            const columns = currentParticipant === 'A' ? map.participantAColumns : map.participantBColumns;
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

            return [{
                participant: currentParticipant,
                ordinality: ordinality || 0,
                transcript: transcript || '',
                toPredict: toPredict || ''
            }];
        }
    };
}