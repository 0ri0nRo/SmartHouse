FROM golang:1.22 AS build

WORKDIR /app

COPY go/go.mod ./go.mod
COPY go/cmd ./cmd
COPY go/internal ./internal

RUN go build -buildvcs=false -o /out/smarthouse ./cmd/smarthouse

FROM gcr.io/distroless/base-debian12:nonroot

WORKDIR /app

COPY --from=build /out/smarthouse /app/smarthouse
COPY src/static/react /app/src/static/react

EXPOSE 5000

ENV HOST=0.0.0.0
ENV PORT=5000
ENV STATIC_DIR=src/static/react

ENTRYPOINT ["/app/smarthouse"]
