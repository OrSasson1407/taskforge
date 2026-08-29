FROM google/cloud-sdk:alpine
RUN apk add --no-cache openjdk21-jre-headless
RUN gcloud components install beta cloud-firestore-emulator --quiet
EXPOSE 8080
ENTRYPOINT ["gcloud", "beta", "emulators", "firestore", "start", "--host-port=0.0.0.0:8080"]
