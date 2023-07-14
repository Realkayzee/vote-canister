import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt, Principal, int32} from "azle";

type Contestant = Record<{
    tag: number;
    name: string;
    voteCount: int32;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
    electionCreator: Principal;
}>

type Create = Record<{
    id: Principal;
    created: boolean;
    createdAt: nat64;
    contestantTags: Vec<int32>;
    started: boolean;
    ended: boolean;
}>

let tagId:int32 = 1;

// Election must e created before adding contestant
const createElectionStorage = new StableBTreeMap<Principal, Create>(0, 38, 100_000);

// key to value mapping to track each contestant data by their tag
const contestantStorage = new StableBTreeMap<int32, Contestant>(1, 38, 100_000);
// key to value mapping to know when a user has voted. The key is of the format
// caller principal + creator principal
const voted = new StableBTreeMap<string, boolean>(2, 100, 8);

// Function used to create an election before adding contestants
$update
export function createElection(): Result<Create, string> {
    const create: Create = {
        id: ic.caller(),
        created: true,
        createdAt: ic.time(),
        contestantTags: [],
        started: false,
        ended: false
    }

    createElectionStorage.insert(create.id, create);
    return Result.Ok(create);
}


// function responsible for adding contestants
// Note: Only Election creator can add contestant.
// Note: Contestant cannot be added for election that already started or ended.
$update
export function addContestant(_name: string): Result<Contestant, string> {
    let _tag:number = tagId;
    tagId = tagId + 1;

    return match(createElectionStorage.get(ic.caller()), {
        Some: (create) => {
            const updateCreate: Create = {...create, contestantTags: [...create.contestantTags, _tag]};
            createElectionStorage.insert(ic.caller(), updateCreate)

            if(create.created && !create.ended && !create.started){
                const contestant: Contestant = {
                    tag: _tag,
                    name: _name,
                    voteCount: 0,
                    createdAt: ic.time(),
                    updatedAt: Opt.None,
                    electionCreator: ic.caller()
                }

                contestantStorage.insert(contestant.tag, contestant);
                return Result.Ok<Contestant, string>(contestant);
            }else{
                return Result.Err<Contestant, string>(`error adding contestant, either election as started or ended.`)
            }
        },
        None: () => Result.Err<Contestant, string>(`principal=${ic.caller()} has not created an election`)
    })
}

// Function for election creator to open voting
$update
export function startElection(): Result<Create, string> {
    return match(createElectionStorage.get(ic.caller()), {
        Some: (create) => {
            const updateStarted: Create = {...create, started: true};

            createElectionStorage.insert(ic.caller(), updateStarted);
            return Result.Ok<Create, string>(updateStarted);
        },
        None: () => Result.Err<Create, string>(`Error starting election`)
    })
}

// Function for election creator to end voting
$update
export function endElection(): Result<Create, string> {
    return match(createElectionStorage.get(ic.caller()), {
        Some: (create) => {
            const updateEnded: Create = {...create, ended: true};

            createElectionStorage.insert(ic.caller(), updateEnded);
            return Result.Ok<Create, string>(updateEnded);
        },
        None: () => Result.Err<Create, string>(`Error ending election`)
    })
}


$query
export function getStatus(principal: Principal): Opt<Create> {
    return createElectionStorage.get(principal)
}


// Function that handles users voting
// Note: Users can only vote ones for a particular election created
$update
export function vote(_tag:int32): Result<Contestant, string> {
    return match(contestantStorage.get(_tag), {
        Some: (contestant) => {
            const status = getStatus(contestant.electionCreator)
            if(status.Some?.started && !status.Some?.ended){
                const updateContestant: Contestant = {...contestant, voteCount: (contestant.voteCount + 1), updatedAt: Opt.Some(ic.time())};
                contestantStorage.insert(_tag, updateContestant);

                const caller = ic.caller().toString();
                const creator = ic.caller().toString();
                const keyValue = caller + creator;

                voted.insert(keyValue, true)

                return Result.Ok<Contestant, string>(updateContestant);

            } else{
                return Result.Err<Contestant, string>(`Election hasn't started`)
            }
        },
        None: () => Result.Err<Contestant, string>(`Unable to vote`)
    })
}

$query
export function checkResult(_tag:int32): Result<int32, string> {
    return match(contestantStorage.get(_tag), {
        Some: (contestant) => Result.Ok<int32, string>(contestant.voteCount),
        None: () => Result.Err<int32, string>(`Result not found`)
    })
}

$query
export function getElectionCreations(): Result<Vec<Create>, string> {
    return Result.Ok(createElectionStorage.values());
}


// Winner can only be annouced by the election creator
$query 
export function announceWinner(): Contestant | undefined {
    let winnerCounter = 0;
    let con;
    const _getContestants:Contestant[] | undefined = getContestants(ic.caller()).Ok
    if(_getContestants){
        for(let i = 0; i < _getContestants?.length; i++){
            if(winnerCounter < _getContestants[i].voteCount){
                winnerCounter = _getContestants[i].voteCount;
                con = _getContestants[i];
            }
        }
    }
    return con
}

$query
export function getContestants(principal: Principal): Result<Vec<Contestant>, string> {
    return match(createElectionStorage.get(principal), {
        Some: (create) => {
            const _tags: int32[] = create.contestantTags;
            return Result.Ok<Vec<Contestant>, string>(contestantByTags(_tags))
        },
        None: () => Result.Err<Vec<Contestant>, string>(`Result not found`)
    })
}

$query
export function contestantByTags(_tags:int32[]): Contestant[] {
    let contestants = new Array();
    for(let i = 0; i < _tags.length; i++){
        contestants[i] = contestantStorage.get(_tags[i]).Some;
    }

    return contestants
}