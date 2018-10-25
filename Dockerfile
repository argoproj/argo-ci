FROM node:9.4.0

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
EXPOSE 8002
CMD ["sh", "-c", "node /app/main.js --workflowsNamespace $WORKFLOWS_NAMESPACE --namespace $NAMESPACE --inCluster $IN_CLUSTER --argoUiUrl $ARGO_UI_URL --argoCiImage $ARGO_CI_IMAGE --controllerInstanceId $CONTROLLER_INSTANCE_ID"]
