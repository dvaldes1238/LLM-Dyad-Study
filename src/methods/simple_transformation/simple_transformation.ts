import dotenv from 'dotenv';
import OpenAI from "openai";
import { ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam, ChatModel } from "openai/resources";
import { ColumnMap, ColumnMapTypeEnum, Dyad, Turn } from "../../types";
import { MethodResultType } from '../types';
dotenv.config();


export async function simpleTransformation(openAi: OpenAI, conversation: Turn[], systemPrompt: string, model: ChatModel = 'gpt-4o-mini') {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: systemPrompt
        } satisfies ChatCompletionSystemMessageParam,
        {
            role: 'user',
            content: conversation.length > 0 ? conversation.map(turn => `${turn.participant}: ${turn.transcript}`).join('\n') : conversation[0].transcript,
        } satisfies ChatCompletionUserMessageParam
    ];

    const completion = await openAi.chat.completions.create({
        model,
        stream: false,
        seed: 12,
        temperature: 0,
        messages,
    });

    return { content: completion.choices[0].message.content! };
}

export function parseSimpleTransformationResult(columnMap: ColumnMap, dyad: Dyad, participant: 'A' | 'B', result: { content: string }, ordinality?: number): MethodResultType {
    const actualValue = dyad.turns.find(turn => turn.participant === participant && turn.toPredict !== '')?.toPredict;

    switch (columnMap.type) {
        case ColumnMapTypeEnum.BOTH_PARTICIPANTS_IN_ONE_ROW:
            return {
                [columnMap.dyadIdColumnName]: dyad.dyadId,
                participant: participant,
                [participant === 'A' ? columnMap.participantAColumns.toPredictColumnName : columnMap.participantBColumns.toPredictColumnName]: actualValue,

                ...(ordinality ? { [participant === 'A' ? columnMap.participantAColumns.ordinalityColumnName : columnMap.participantBColumns.ordinalityColumnName]: ordinality } : {}),

                predictedValue: result.content
            };
        case ColumnMapTypeEnum.EACH_PARTICIPANT_IN_SEPERATE_ROWS:
            return {
                [columnMap.dyadIdColumnName]: dyad.dyadId,
                [columnMap.participantDiscriminatorColumnName]: participant === 'A' ? columnMap.participantAColumns.discriminatorValue : columnMap.participantBColumns.discriminatorValue,
                [participant === 'A' ? columnMap.participantAColumns.toPredictColumnName : columnMap.participantBColumns.toPredictColumnName]: actualValue,

                ...(ordinality ? { [participant === 'A' ? columnMap.participantAColumns.ordinalityColumnName : columnMap.participantBColumns.ordinalityColumnName]: ordinality } : {}),

                predictedValue: result.content
            };
    }
}