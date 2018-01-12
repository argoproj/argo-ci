import * as express from 'express';

export interface Commit {
    repo: Repository;
    sha: string;
}

export interface Repository {
    cloneUrl: string;
    fullName: string;
}

export interface ScmEvent {
    commit: Commit;
    type: 'push' | 'pull_request';
    repo: Repository;
}

export interface CommitStatus {
    state: 'error' | 'failure' | 'pending' | 'success';
    targetUrl: string;
    description: string;
}

export interface Scm {
    type: ScmType;
    parseEvent(request: express.Request): Promise<ScmEvent>;
    addCommitStatus(repoUrl: string, repoName: string, sha: string, status: CommitStatus);
}

export type ScmType = 'github';

export interface Credentials { username: string; password: string; secret?: string; }

export interface RepoCredentials { [url: string]: Credentials; }

export interface Settings {
    externalUiUrl: string;
}
