from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("connections", "0002_githubconnection_client_id")]

    operations = [
        migrations.RenameField(
            model_name="githubconnection", old_name="config_id", new_name="credential_id"
        ),
    ]
