from django.core.management.base import BaseCommand

from tasks.demo import seed_demo


class Command(BaseCommand):
    help = "Seed an empty isolated read-only demo database with 40 fictional tasks."

    def handle(self, **options):
        seed_demo()
        self.stdout.write("Seeded 40 fictional tasks. Agent execution is disabled.")
