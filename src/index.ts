import Ajv from "ajv";
import csvParser from "csv-parser";
import csvStringify from "csv-stringify/sync";
import dotenv from 'dotenv';
import fs, { readdirSync, readFileSync } from 'fs';
import OpenAI from "openai";
import { ChatModel } from "openai/resources";
import path, { dirname } from "path";
import { llmIsParticipant, parseLlmIsParticipantResult } from "./methods/llm_is_participant/llm_is_participant";
import { parseSimpleTransformationResult, simpleTransformation } from "./methods/simple_transformation/simple_transformation";
import { MethodResultType, MethodType } from "./methods/types";
import { BothParticipantsInOneRowParser } from "./parsers/BothParticipantsInOneRow";
import { EachParticipantInSeperateRowsParser } from "./parsers/EachParticipantInSeperateRows";
import { ColumnMap, ColumnMapTypeEnum, Dyad } from "./types";
dotenv.config();

const openAi = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const args = process.argv.slice(2); // Remove node and script path

const isTransformation = Boolean(args[3]);

const dataRoot = path.join(path.resolve('./data'), args[0] ?? '_test');
const method = (args[1] ?? MethodType.EACH_TURN_ALONE) as MethodType;
const model = (args[2] ?? 'gpt-4o-mini') as ChatModel;
const question = (isTransformation ? args[3] : 'Which gender do you identify as?') as string;

if (!Object.values(MethodType).includes(method)) {
    throw new Error(`Invalid method: ${method}. Please use one of the following: ${Object.values(MethodType).join(', ')}`);
}

async function main() {

    console.log('Using folder', dataRoot);
    console.log('Using method', method);

    const date = new Date();
    const formattedDate = date.toISOString().split('T')[0].slice(5); // MM-DD format
    const formattedTime = date.toLocaleTimeString().replace(/:/g, '-');
    const outputFolderPath = path.join(dataRoot, `${method}_${formattedDate}_${formattedTime}`);

    let mapFilePath: string | undefined;
    const dataFiles: string[] = [];

    readdirSync(dataRoot).forEach(async (file) => {
        if (file.endsWith('.csv')) {
            dataFiles.push(file);
        } else if (file.endsWith('.json')) {
            if (mapFilePath) {
                throw new Error('Multiple map files found. Please remove unneeded ones or rename them to not end in .json.');
            }
            mapFilePath = file;
            console.log(`Found map file ${mapFilePath}.`);
        }
    });

    if (!dataFiles.length) {
        throw new Error(`No data files found. Please add one or more data files ending in .csv to '${dataRoot}'.`);
    }

    console.log(`Found ${dataFiles.length} data files.`);

    if (!mapFilePath) {
        throw new Error(`No map file found. Please add a map file ending in .json to '${dataRoot}'.`);
    }

    let columnMap: ColumnMap;
    try {
        const rawColumnMap = JSON.parse(readFileSync(path.join(dataRoot, mapFilePath), 'utf8'));
        const ajv = new Ajv();
        const validate = ajv.compile(ColumnMap);
        if (!validate(rawColumnMap)) {
            throw new Error(`Invalid column map: ${ajv.errorsText(validate.errors)}`);
        }
        columnMap = rawColumnMap as ColumnMap;
    } catch (error) {
        if (error instanceof Error) {
            // Create example objects for each column map type
            const examples = {
                [ColumnMapTypeEnum.BOTH_PARTICIPANTS_IN_ONE_ROW]: {
                    type: ColumnMapTypeEnum.BOTH_PARTICIPANTS_IN_ONE_ROW,
                    dyadIdColumnName: "dyad_id",
                    participantAColumns: {
                        ordinalityColumnName: "participant_a_time",
                        transcriptColumnName: "participant_a_text",
                        toPredictColumnName: "participant_a_actual_value"
                    },
                    participantBColumns: {
                        ordinalityColumnName: "participant_b_time",
                        transcriptColumnName: "participant_b_text",
                        toPredictColumnName: "participant_b_actual_value"
                    }
                } satisfies ColumnMap,

                [ColumnMapTypeEnum.EACH_PARTICIPANT_IN_SEPERATE_ROWS]: {
                    type: ColumnMapTypeEnum.EACH_PARTICIPANT_IN_SEPERATE_ROWS,
                    dyadIdColumnName: "dyad_id",
                    participantDiscriminatorColumnName: "speaker",
                    participantAColumns: {
                        discriminatorValue: "A",
                        ordinalityColumnName: "time",
                        transcriptColumnName: "text",
                        toPredictColumnName: "actual_value"
                    },
                    participantBColumns: {
                        discriminatorValue: "B",
                        ordinalityColumnName: "time",
                        transcriptColumnName: "text",
                        toPredictColumnName: "actual_value"
                    }
                } satisfies ColumnMap
            };

            throw new Error(`Failed to parse or validate column map: ${error.message}\n\nPlease use one of the following formats:\n\n${Object.entries(examples)
                .map(([type, example]) => `- ${type}\n${JSON.stringify(example, null, 2)}\n`)
                .join('\n')
                }`);
        }
        throw error;
    }

    console.log(`Mapping columns using ${columnMap.type} with values:`);
    for (const [key, value] of Object.entries(columnMap)) {
        if (key !== 'type') {
            console.log(`\t- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
    }
    console.log('\n');

    for (const file of dataFiles) {
        const dyads = await new Promise<Dyad[]>((resolve, reject) => {
            console.log(`Processing ${file}...`);
            const dyads: Record<string, Dyad> = {};

            fs.createReadStream(path.join(dataRoot, file))
                .pipe(csvParser())
                .on('data', (row: Record<string, string>) => {
                    const dyadId = row[columnMap.dyadIdColumnName];

                    if (!dyadId) {
                        throw new Error(`No dyad ID found in row: ${JSON.stringify(row)}`);
                    }

                    if (!dyads[dyadId]) {
                        dyads[dyadId] = {
                            dyadId,
                            turns: [],
                            emptyUndefinedOrNaValuesCount: {
                                participant: 0,
                                ordinality: 0,
                                transcript: 0,
                                toPredict: 0
                            }
                        };
                    }

                    switch (columnMap.type) {
                        case ColumnMapTypeEnum.BOTH_PARTICIPANTS_IN_ONE_ROW:
                            dyads[dyadId].turns.push(...BothParticipantsInOneRowParser().parseRow(columnMap, row, dyads[dyadId].emptyUndefinedOrNaValuesCount));
                            break;
                        case ColumnMapTypeEnum.EACH_PARTICIPANT_IN_SEPERATE_ROWS:
                            dyads[dyadId].turns.push(...EachParticipantInSeperateRowsParser().parseRow(columnMap, row, dyads[dyadId].emptyUndefinedOrNaValuesCount));
                            break;
                    }
                })
                .on('end', () => {
                    Object.values(dyads).forEach(dyad => {
                        dyad.turns.sort((a, b) => a.ordinality - b.ordinality);
                    });
                    resolve(Object.values(dyads));
                })
                .on('error', (error) => {
                    reject(error);
                });
        });

        console.log(`Loaded ${file} with ${dyads.length} dyads and ${dyads.reduce((acc, dyad) => acc + dyad.turns.length, 0)} turns.`);
        dyads.forEach(dyad => {
            if (Object.values(dyad.emptyUndefinedOrNaValuesCount).some(value => value > 0)) {
                console.log(`Empty, undefined, or N/A values for dyad ${dyad.dyadId}:`);
                Object.entries(dyad.emptyUndefinedOrNaValuesCount).forEach(([key, value]) => {
                    if (value > 0) {
                        console.log(`\t\t-${key}: ${value}`);
                    }
                });
            }
        });

        const rl = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise<void>((resolve) => {
            rl.question(`\nPress enter to process ${file} or enter any text to quit...\n\n`, (answer: string) => {
                if (answer.trim()) {
                    rl.close();
                    process.exit(0);
                }

                rl.close();
                resolve();
            });
        });


        const results = await Promise.all(dyads.map(dyad => runMethod(method, dyad, columnMap, model, question)));
        // const results = await runMethod(method, dyads[8], columnMap, model, question);

        writeOutput(results.flat(), path.join(outputFolderPath, file.replace('.csv', `_${method}_output.csv`)));
        console.log(`Wrote output to ${path.join(outputFolderPath, file.replace('.csv', `_${method}_output.csv`))}`);
    }

    console.log('Done!');
}

async function runMethod(method: MethodType, dyad: Dyad, columnMap: ColumnMap, model: ChatModel, question: string): Promise<MethodResultType[]> {
    console.log(`${isTransformation ? 'Transforming' : 'Running'} ${method} for dyad ${dyad.dyadId}...`);

    switch (method) {
        case MethodType.EACH_PARTICIPANT_SIMULTANEOUS:
            if (isTransformation) {

            }

            return Promise.all((['A', 'B'] as const).map(async (participant) => {
                const turns = dyad.turns;

                let result: MethodResultType;

                if (isTransformation) {
                    const output = await simpleTransformation(openAi, turns, question, model);
                    result = parseSimpleTransformationResult(columnMap, dyad, participant, output);
                } else {
                    const output = await llmIsParticipant(openAi, turns, question, participant, model);
                    result = parseLlmIsParticipantResult(columnMap, dyad, participant, output);
                }

                return { ...result, transcript: turns.map(turn => `${turn.participant}: ${turn.transcript}`).join('\n') };
            }));
        case MethodType.EACH_PARTICIPANT_ALONE:
            if (isTransformation) {

            }

            return Promise.all((['A', 'B'] as const).map(async (participant) => {
                const turns = dyad.turns.filter(turn => turn.participant === participant);

                let result: MethodResultType;

                if (isTransformation) {
                    const output = await simpleTransformation(openAi, turns, question, model);
                    result = parseSimpleTransformationResult(columnMap, dyad, participant, output);
                } else {
                    const output = await llmIsParticipant(openAi, turns, question, participant, model);
                    result = parseLlmIsParticipantResult(columnMap, dyad, participant, output);
                }

                return { ...result, transcript: turns.map(turn => `${turn.participant}: ${turn.transcript}`).join('\n') };
            }));
        case MethodType.EACH_TURN_ALONE:
            return Promise.all(dyad.turns.map(async (turn) => {
                const turns = [turn];
                let result: MethodResultType;

                if (isTransformation) {
                    const output = await simpleTransformation(openAi, turns, question, model);
                    result = parseSimpleTransformationResult(columnMap, dyad, turn.participant, output, turn.ordinality);
                } else {
                    const output = await llmIsParticipant(openAi, turns, question, turn.participant, model);
                    result = parseLlmIsParticipantResult(columnMap, dyad, turn.participant, output, turn.ordinality);
                }

                return { ...result, transcript: turns.map(turn => `${turn.participant}: ${turn.transcript}`).join('\n') };
            }));
        default:
            throw new Error(`Invalid method: ${method}. Please use one of the following: ${Object.values(MethodType).join(', ')}`);
    }
}

function writeOutput(output: MethodResultType[], path: string) {
    const dir = dirname(path);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const csvString = csvStringify.stringify(output, { header: true, columns: Object.keys(output[0]) });

    fs.writeFileSync(path, csvString);
}


main().catch(console.error);
