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
		creds, err := getCredentials(cache)
		if err != nil {
			log.Fatal(err)
		}
		UpdateCredentialsFile(creds)
	},
}

func getSSODetails() (string, string) {
	homedir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	credspath := fmt.Sprintf("%s/.aws/config", homedir)
	cfg, err := ini.Load(credspath)
	if err != nil {
		log.Fatal(err)
	}
	d := cfg.Section("default")
	accountId := d.Key("sso_account_id").String()
	roleName := d.Key("sso_role_name").String()
	if accountId == "" {
		log.Fatal("No sso_account_id in config file - have you run aws sso configure?")
	}
	if roleName == "" {
		log.Fatal("No sso_role_name specified in config file - have you run aws sso configure?")
	}
	return accountId, roleName
}

func UpdateCredentialsFile(creds *Creds) {
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
