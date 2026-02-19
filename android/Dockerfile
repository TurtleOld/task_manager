FROM eclipse-temurin:17-jdk AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . /app

ENV GRADLE_USER_HOME=/app/.gradle

RUN chmod +x /app/gradlew

ARG ANDROID_API_BASE_URL
ARG ANDROID_WEB_BASE_URL
ARG ONESIGNAL_APP_ID

ENV ANDROID_API_BASE_URL=$ANDROID_API_BASE_URL
ENV ANDROID_WEB_BASE_URL=$ANDROID_WEB_BASE_URL
ENV ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID

RUN /app/gradlew :app:assembleDebug

FROM scratch AS export
COPY --from=builder /app/app/build/outputs /outputs
