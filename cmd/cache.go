package cmd

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"time"
)

type CacheFile struct {
	StartUrl    string `json:startUrl`
	Region      string `json:region`
	AccessToken string `json:accessToken`
	ExpiresAt   string `json:expiresAt`
	Expiration  time.Time
}

func parseDate(expiration string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, expiration)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05MST", expiration)
		if err != nil {
			log.Fatal(err)
		}
	}
	return t
}

func getCacheFile() CacheFile {
	homedir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	cachepath := fmt.Sprintf("%s/.aws/sso/cache", homedir)
	files, err := ioutil.ReadDir(cachepath)
	if err != nil {
		log.Fatal(err)
	}
	var latestCache *CacheFile
	for _, f := range files {
		path := fmt.Sprintf("%s/%s", cachepath, f.Name())
		jsonFile, err := os.Open(path)
		if err != nil {
			log.Fatal(err)
		}
		defer jsonFile.Close()
		value, err := ioutil.ReadAll(jsonFile)
		if err != nil {
			log.Fatal(err)
		}
		var cache CacheFile
		json.Unmarshal(value, &cache)
		if cache.AccessToken != "" {
			cache.Expiration = parseDate(cache.ExpiresAt)
			if latestCache == nil || latestCache.Expiration.Before(cache.Expiration) {
				latestCache = &cache
			}
		}
	}
	if latestCache == nil {
		log.Fatal("No cached credentials. You need to run aws sso login.")
	}
	if latestCache.Expiration.Before(time.Now()) {
		log.Fatal("Cached credentials have expired. You need to run aws sso login.")
	}
	return *latestCache
}