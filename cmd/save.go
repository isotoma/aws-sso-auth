package cmd

import (
	"fmt"
	"log"
	"os"

	"github.com/spf13/cobra"
	"gopkg.in/ini.v1"
)

func init() {
	rootCmd.AddCommand(saveCmd)
}

var saveCmd = &cobra.Command{
	Use: "save",
	Run: func(cmd *cobra.Command, args []string) {
		cache := getCacheFile()
		creds, err := getCredentials(cache, "854689711824", "doug.winter")
		if err != nil {
			log.Fatal(err)
		}
		UpdateIni(creds)
	},
}

func UpdateIni(creds *Creds) {
	homedir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	credspath := fmt.Sprintf("%s/.aws/credentials", homedir)
	cfg := ini.Empty()
	cfg.Append(credspath)
	d := cfg.Section("default")
	d.Key("aws_access_key_id").SetValue(creds.AccessKeyId)
	d.Key("aws_secret_access_key").SetValue(creds.SecretAccessKey)
	d.Key("aws_session_token").SetValue(creds.SessionToken)
	d.Key("aws_security_token").SetValue(creds.SessionToken)
	cfg.SaveTo(credspath)
}
