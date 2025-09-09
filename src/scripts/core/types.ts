export type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
export type Move = { level: number; move: string };
// Full move info loaded from data
export type MoveInfo = {
    id?: string;
    name?: string;
    type?: string;
    category?: string; // "Physical" | "Special" | "Status"
    power?: number;
    accuracy?: number;
    pp?: number;
    priority?: number;
    target?: string;
    flags?: string[];
    description?: string;
};
export type MoveIndex = Record<string, MoveInfo>;
export type Evolution = { to: string; method: string; param: string };
export type Mon = {
    id: string;
    internalName: string;
    name: string;
    types: string[];
    stats: Stats;

    abilities: string[];
    hiddenAbility?: string;

    // text
    summary?: string;

    // learnsets / misc (from new JSON)
    moves?: Move[];
    tutorMoves?: string[];
    eggMoves?: string[];
    machineMoves?: string[];
    evolutions?: Evolution[];

    // relations
    prevo?: string;
    isForm?: boolean;
    baseInternal?: string;
    // Optional form metadata (present for form entries in JSON)
    formIndex?: number;
    formName?: string;

    // add dex number
    num: number;

    // Additional details preserved from pokemon.json that
    // are not otherwise mapped/displayed explicitly.
    extra?: Record<string, any>;
};

export type AbilityInfo = { name: string; description?: string };
export type AbilityMap = Record<string, AbilityInfo>;
export type SuggestKind = 'mon' | 'move' | 'ability' | 'type' | 'loc';
export type SuggestItem = {
    kind: SuggestKind;
    id: string;           // internal id (mon.id for Pokémon; ability/move/type internal)
    label: string;        // display name
    sub?: string;         // optional subtext
    iconHTML?: string;    // optional left icon HTML
    score?: number;       // ranking score
    search: string;
};

export type EncounterRow = [number, string, number, number]; // [chance, mon, min, max]
export type EncounterLocation = {
    id: string;            // "003"
    name: string;          // "Forested Cavern"
    encounters: Record<string, EncounterRow[]>; // e.g. { Land: [...], Water: [...] }
};

export type TypeInfo = {
    name: string; internalId: string;
    weaknesses: string[]; resistances: string[]; immunities: string[];
    isSpecialType: boolean; isPseudoType: boolean; index: number;
};

export type Item = {
    id: string;
    internalName: string;
    name: string;
    description?: string;
    pocket?: number | string;
    price?: number | string;
    sellPrice?: number | string;
    fieldUse?: string;
    flags?: string[];
    namePlural?: string;
    consumable?: boolean;
    extra?: Record<string, string>;
};

export type IntlPack = {
    moveTargets?: Record<string, string>;
    moveFlags?: Record<string, string>;
    evoMethods?: Record<string, string>;
};

export type EvoEdge = { from: string; to: string; method?: string; param?: string };


