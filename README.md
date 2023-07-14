# voting canister

Voting canister is an open voting platform where anybody can create election for their organization (usually organization electoral commitee), only Electoral committee that created an election can add contestestant with the function "addContestant".

## Voting canister process
1. Electoral committee creates an election with the function "createElection"
2. Electoral Commitee add contestant contesting for a particular post with the function "addContestant"
3. Electoral committee opens the opportunity for voting by interacting with "startElection"
4. Users can go on to vote by specifying contestant tag as the person they want to vote for.
5. The voting is only ones for each user
6. Electoral committe can end the election after a period of time
7. Since it's open anybody can check the updated result as the election is going on until the final announcement by the electoral committee

