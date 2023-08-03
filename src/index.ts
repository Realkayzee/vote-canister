import { 
    $query, 
    $update, 
    Record, 
    StableBTreeMap, 
    Vec, 
    match, 
    Result, 
    nat64, 
    ic, 
    Opt, 
    Principal, 
    int32
} from "azle";
import { v4 as uuidv4 } from 'uuid';

type Contestant = Record<{
    tag: number;
    name: string;
    voteCount: int32;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
    parentId: string;
    electionTag: int32;
}>

type Create = Record<{
    id: string;
    creator: Principal;
    electionTag: int32;
    created: boolean;
    createdAt: nat64;
    contestantTags: Vec<int32>;
    started: boolean;
    ended: boolean;
}>

let tag:int32 = 0;
let tagId:int32 = 1;

// Election must e created before adding contestant
const createElectionStorage = new StableBTreeMap<string, Create>(0, 44, 100_000);

// key to value mapping to track each contestant data by their tag
const contestantStorage = new StableBTreeMap<int32, Contestant>(1, 38, 100_000);
// key to value mapping to know when a user has voted. The key is of the format
// election tag + creator principal
const voted = new StableBTreeMap<string, boolean>(2, 100, 8);



// Function used to create an election before adding contestants
$update
export function createElection(): Result<Create, string> {
    const create: Create = {
        id: uuidv4(),
        creator: ic.caller(),
        electionTag: tag,
        created: true,
        createdAt: ic.time(),
        contestantTags: [],
        started: false,
        ended: false
    }
    tag = tag + 1;

    createElectionStorage.insert(create.id, create);
    return Result.Ok(create);
}


// function responsible for adding contestants
// Note: Only Election creator can add contestant.
// Note: Contestant cannot be added for election that already started or ended.
$update
export function addContestant(id: string, _name: string,): Result<Contestant, string> {
    let _tag:number = tagId;
    tagId = tagId + 1;

    return match(createElectionStorage.get(id), {
        Some: (create) => {
            const updateCreate: Create = {...create, contestantTags: [...create.contestantTags, _tag]};
            createElectionStorage.insert(id, updateCreate)

            if(create.created && !create.ended && !create.started){
                const contestant: Contestant = {
                    tag: _tag,
                    name: _name,
                    voteCount: 0,
                    createdAt: ic.time(),
                    updatedAt: Opt.None,
                    parentId: create.id,
                    electionTag: create.electionTag
                }

                contestantStorage.insert(contestant.tag, contestant);
                return Result.Ok<Contestant, string>(contestant);
            }else{
                return Result.Err<Contestant, string>(`Error adding contestant, either election has started or ended.`)
            }
        },
        None: () => Result.Err<Contestant, string>(`Election has not been created for id={id}`)
    })
}

// Function for election creator to open voting
$update
export function startElection(id: string): Result<Create, string> {
    return match(createElectionStorage.get(id), {
        Some: (create) => {
            if(create.contestantTags.length < 2){
                return Result.Err<Create,string>("Can't start an election without at least two contestants")
            }
            const updateStarted: Create = {...create, started: true};

            createElectionStorage.insert(id, updateStarted);
            return Result.Ok<Create, string>(updateStarted);
        },
        None: () => Result.Err<Create, string>(`Election has not been created for id={id}`)
    })
}

// Function for election creator to end voting
$update
export function endElection(id: string): Result<Create, string> {
    return match(createElectionStorage.get(id), {
        Some: (create) => {
            const updateEnded: Create = {...create, ended: true};

            createElectionStorage.insert(id, updateEnded);
            return Result.Ok<Create, string>(updateEnded);
        },
        None: () => Result.Err<Create, string>(`Election has not been created for id={id}`)
    })
}


// Function that handles users voting
// Note: Users can only vote ones for a particular election created
$update
export function vote(_tag:int32): Result<Contestant, string> {
    return match(contestantStorage.get(_tag), {
        Some: (contestant) => {
            const status = getStatus(contestant.parentId)
            if(status.Ok?.started && !status.Ok?.ended){
                const tag = contestant.electionTag.toString(); // stringify election tag to create uniquedfness
                const creator = ic.caller().toString();
                const keyValue = tag + creator;
                if(voted.get(keyValue).Some){
                    return Result.Err<Contestant,string>("Caller has already voted for this election")
                }
                const updateContestant: Contestant = {...contestant, voteCount: (contestant.voteCount + 1), updatedAt: Opt.Some(ic.time())};
                contestantStorage.insert(_tag, updateContestant);

                voted.insert(keyValue, true)

                return Result.Ok<Contestant, string>(updateContestant);

            } else{
                return Result.Err<Contestant, string>(`Election is over or hasn't started yet started`)
            }
        },
        None: () => Result.Err<Contestant, string>(`Contestant not found`)
    })
}

$query
export function getStatus(id: string): Result<Create,string> {
    return match(createElectionStorage.get(id), {
        Some: (election) => Result.Ok<Create, string>(election),
        None: () => Result.Err<Create, string>(`Election has not been created for id={id}`)
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

$query
export function getVote(): Result<Vec<boolean>, string> {
    return Result.Ok(voted.values())
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
    getRandomValues: () => {
      let array = new Uint8Array(32);
  
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
  
      return array;
    }
  };