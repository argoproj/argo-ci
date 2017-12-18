FROM node:6.9.5

RUN apt-get update && apt-get install -y apt-transport-https && \
  curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - && \
  echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list && \
  apt-get update && apt-get install yarn


WORKDIR /src
ADD ["package.json", "yarn.lock", "./"]

RUN yarn install

ADD [".", "."]

RUN yarn build && yarn install --production

FROM node:6.9.5-alpine

COPY  --from=0 ./src/dist /app
COPY  --from=0 ./src/node_modules /app/node_modules
WORKDIR /app

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh

EXPOSE 8001
CMD ["sh", "-c", "node /app/main.js --inCluster $IN_CLUSTER --githubSecret $GITHUB_SECRET --githubUser $GITHUB_USER --githubPassword $GITHUB_PASSWORD --argoUiUrl $ARGO_UI_URL"]
