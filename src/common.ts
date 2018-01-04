import * as express from 'express';

export interface Repository {
    cloneUrl: string;
    fullName: string;
}

export interface ScmEvent {
    repository: Repository;
    headCommitSha: string;
    type: 'push' | 'pull_request';
}

export interface CommitStatus {
    state: 'error' | 'failure' | 'pending' | 'success';
    targetUrl: string;
    description: string;
}

export interface Scm {
    type: ScmType;
    parseEvent(request: express.Request): Promise<ScmEvent>;
    addCommitStatus(repoUrl: string, repoName: string, commit: string, status: CommitStatus);
}

export type ScmType = 'github';

export interface Credentials { username: string; password: string; secret?: string; }

export interface RepoCredentials { [url: string]: Credentials; }

export interface Settings {
    externalUiUrl: string;
}
