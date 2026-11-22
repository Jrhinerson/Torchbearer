import signal

from django.core.management.base import BaseCommand, CommandError

from tasks.worker import Worker


class Command(BaseCommand):
    help = "Run Torchbearer's local agent queue. One worker owns each data directory."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once", action="store_true", help="Process at most one queued run, then exit."
        )

    def handle(self, *args, **options):
        worker = Worker()
        for signum in [signal.SIGINT, signal.SIGTERM]:
            signal.signal(signum, lambda *_: worker.stop.set())
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, lambda *_: worker.stop.set())
        self.stdout.write("Agent worker started.")
        try:
            worker.run(once=options["once"])
        except RuntimeError as error:
            raise CommandError(str(error)) from error
