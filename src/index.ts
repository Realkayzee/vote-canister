import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt, Principal, int32 } from "azle";

type Contestant = Record<{
  tag: int32;
  name: string;
  voteCount: int32;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
  electionCreator: Principal;
}>;

type Create = Record<{
  id: Principal;
  created: boolean;
  createdAt: nat64;
  contestantTags: Vec<int32>;
  started: boolean;
  ended: boolean;
}>;

let tagId: int32 = 1;

const createElectionStorage = new StableBTreeMap<Principal, Create>(0, 38, 100_000);
const contestantStorage = new StableBTreeMap<int32, Contestant>(1, 38, 100_000);
const voted = new StableBTreeMap<string, boolean>(2, 100, 8);

$update
export function createElection(): Result<Create, string> {
  const caller = ic.caller();
  if (createElectionStorage.get(caller).isSome()) {
    return Result.Err<Create, string>(`Election already created by ${caller.toString()}`);
  }

  const create: Create = {
    id: caller,
    created: true,
    createdAt: ic.time(),
    contestantTags: [],
    started: false,
    ended: false
  };

  createElectionStorage.insert(caller, create);
  return Result.Ok(create);
}

$update
export function addContestant(name: string): Result<Contestant, string> {
  const caller = ic.caller();
  const createOption = createElectionStorage.get(caller);

  if (createOption.isNone()) {
    return Result.Err<Contestant, string>(`Election not found for ${caller.toString()}`);
  }

  const create = createOption.unwrap();

  if (create.started || create.ended) {
    return Result.Err<Contestant, string>(`Cannot add contestant to a started or ended election`);
  }

  const tag: int32 = tagId;
  tagId = tagId + 1;

  const contestant: Contestant = {
    tag: tag,
    name: name,
    voteCount: 0,
    createdAt: ic.time(),
    updatedAt: Opt.None,
    electionCreator: caller
  };

  contestantStorage.insert(tag, contestant);
  const updatedCreate: Create = { ...create, contestantTags: [...create.contestantTags, tag] };
  createElectionStorage.insert(caller, updatedCreate);

  return Result.Ok(contestant);
}

$update
export function startElection(): Result<Create, string> {
  const caller = ic.caller();
  const createOption = createElectionStorage.get(caller);

  if (createOption.isNone()) {
    return Result.Err<Create, string>(`Election not found for ${caller.toString()}`);
  }

  const create = createOption.unwrap();
  if (create.started) {
    return Result.Err<Create, string>(`Election has already started`);
  }

  const updatedCreate: Create = { ...create, started: true };
  createElectionStorage.insert(caller, updatedCreate);
  return Result.Ok(updatedCreate);
}

$update
export function endElection(): Result<Create, string> {
  const caller = ic.caller();
  const createOption = createElectionStorage.get(caller);

  if (createOption.isNone()) {
    return Result.Err<Create, string>(`Election not found for ${caller.toString()}`);
  }

  const create = createOption.unwrap();
  if (create.ended) {
    return Result.Err<Create, string>(`Election has already ended`);
  }

  const updatedCreate: Create = { ...create, ended: true };
  createElectionStorage.insert(caller, updatedCreate);
  return Result.Ok(updatedCreate);
}

$update
export function vote(tag: int32): Result<Contestant, string> {
  const caller = ic.caller();
  const createOption = createElectionStorage.get(caller);

  if (createOption.isNone()) {
    return Result.Err<Contestant, string>(`Election not found for ${caller.toString()}`);
  }

  const create = createOption.unwrap();
  if (!create.started || create.ended) {
    return Result.Err<Contestant, string>(`Cannot vote in the current election`);
  }

  const contestantOption = contestantStorage.get(tag);

  if (contestantOption.isNone()) {
    return Result.Err<Contestant, string>(`Contestant not found with tag ${tag}`);
  }

  const contestant = contestantOption.unwrap();
  const keyValue = `${caller.toString()}${contestant.electionCreator.toString()}`;

  if (voted.get(keyValue).isSome()) {
    return Result.Err<Contestant, string>(`Already voted for the current election`);
  }

  const updatedContestant: Contestant = {
    ...contestant,
    voteCount: contestant.voteCount + 1,
    updatedAt: Opt.Some(ic.time())
  };

  contestantStorage.insert(tag, updatedContestant);
  voted.insert(keyValue, true);

  return Result.Ok(updatedContestant);
}

$query
export function getStatus(principal: Principal): Opt<Create> {
  return createElectionStorage.get(principal);
}

$query
export function checkResult(tag: int32): Result<int32, string> {
  const contestantOption = contestantStorage.get(tag);

  if (contestantOption.isNone()) {
    return Result.Err<int32, string>(`Contestant not found with tag ${tag}`);
  }

  const contestant = contestantOption.unwrap();
  return Result.Ok(contestant.voteCount);
}

$query
export function getElectionCreations(): Vec<Create> {
  return createElectionStorage.values();
}
