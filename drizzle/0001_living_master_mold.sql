CREATE TABLE "dividends" (
	"source" text NOT NULL,
	"ticker" text NOT NULL,
	"ex_date" date NOT NULL,
	"amount" double precision NOT NULL,
	CONSTRAINT "dividends_source_ticker_ex_date_pk" PRIMARY KEY("source","ticker","ex_date")
);
