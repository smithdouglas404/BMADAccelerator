#!/usr/bin/perl
# Socra Studio updater for the laptop. Runs on the laptop itself (not in Podman), started by launchd.
# Listens only on 127.0.0.1:3099. The Studio's Settings > Update tab talks to it:
#   GET  /status  -> {"state":"idle|running|done|failed","installed":"<sha>","latest":"<sha>","step":"...","log":"..."}
#   POST /update  -> starts the update (header X-Socra: 1 required), answers at once; poll /status.
# The update itself is ~/SocraStudio/bin/socra.sh update (the same script as the setup line).
use strict; use warnings;
use IO::Socket::INET;
use POSIX ":sys_wait_h";

my $HOME = $ENV{HOME};
my $DIR  = "$HOME/SocraStudio";
my $LOG  = "$DIR/update.log";
my $PIDF = "$DIR/.update.pid";
my $RES  = "$DIR/.update.result";
my $VER  = "$DIR/.version";
my $SREV = "$DIR/.script-rev";
my $STARTED = (stat($0))[9] // 0;   # when this file last changed; a newer file means "restart me"
my $SCRIPT_BRANCH = "claude/project-thread-i43blx";
my $RAW = "https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator";
my @ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000");
$ENV{PATH} = "/opt/podman/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

my $srv = IO::Socket::INET->new(LocalAddr => '127.0.0.1', LocalPort => 3099, Proto => 'tcp', Listen => 5, ReuseAddr => 1)
  or die "updater: cannot listen on 127.0.0.1:3099: $!\n";
$SIG{CHLD} = sub { 1 while waitpid(-1, WNOHANG) > 0 };

my ($latest, $latest_at, $slatest, $slatest_at) = ('', 0, '', 0);
sub slurp { my $f = shift; open(my $h, '<', $f) or return ''; local $/; my $s = <$h>; close $h; $s // '' }
sub jstr { my $s = shift // ''; $s =~ s/\\/\\\\/g; $s =~ s/"/\\"/g; $s =~ s/\r//g; $s =~ s/\n/\\n/g; $s =~ s/\t/  /g; $s =~ s/[\x00-\x1f]//g; "\"$s\"" }
sub running { my $p = slurp($PIDF); $p =~ s/\D//g; return ($p && kill(0, $p)) ? $p : 0 }
sub latest_sha {
  if (time - $latest_at > 300) {
    my $j = `curl -fsS --max-time 10 https://api.github.com/repos/smithdouglas404/BMADAccelerator/branches/mac-studio 2>/dev/null`;
    if ($j =~ /"commit"\s*:\s*\{\s*"sha"\s*:\s*"([0-9a-f]{40})"/) { $latest = $1; $latest_at = time }
  }
  $latest
}
# raw.githubusercontent.com keeps a branch address cached for minutes, so a branch URL can hand back an OLD script.
# Ask the API which commit the branch is at, then fetch the script at that exact commit (never stale).
my ($sscript_sha, $sscript_sha_at) = ('', 0);
sub script_sha {
  my $force = shift;
  if ($force || time - $sscript_sha_at > 300 || !$sscript_sha) {
    my $j = `curl -fsS --max-time 10 https://api.github.com/repos/smithdouglas404/BMADAccelerator/branches/$SCRIPT_BRANCH 2>/dev/null`;
    if ($j =~ /"commit"\s*:\s*\{\s*"sha"\s*:\s*"([0-9a-f]{40})"/) { $sscript_sha = $1; $sscript_sha_at = time }
  }
  $sscript_sha
}
sub latest_script_rev {
  if (time - $slatest_at > 300) {
    my $sha = script_sha(0);
    if ($sha) {
      my $t = `curl -fsS --max-time 10 '$RAW/$sha/scripts/laptop/start-on-laptop.sh' 2>/dev/null`;
      if ($t =~ /^SCRIPT_REV="?(\d+)"?/m) { $slatest = $1; $slatest_at = time }
    }
  }
  $slatest
}
sub status_json {
  my $state = running() ? 'running' : (slurp($RES) =~ /^(done|failed)/ ? $1 : 'idle');
  my $log = slurp($LOG); $log =~ s/\e\[[0-9;]*m//g;
  my @steps = ($log =~ /^(Step \d of \d:[^\n]*)/mg);
  my @lines = grep { /\S/ } split /\n/, $log; my $tail = join("\n", @lines > 12 ? @lines[-12..-1] : @lines);
  my $inst = slurp($VER); $inst =~ s/\s//g;
  my $sinst = slurp($SREV); $sinst =~ s/\s//g;
  return '{"state":' . jstr($state) . ',"installed":' . jstr($inst) . ',"latest":' . jstr(latest_sha()) .
         ',"scriptInstalled":' . jstr($sinst) . ',"scriptLatest":' . jstr(latest_script_rev()) .
         ',"step":' . jstr(@steps ? $steps[-1] : '') . ',"log":' . jstr($tail) . '}';
}
sub start_update {
  return 0 if running();
  unlink $RES;
  my $pid = fork();
  return 0 unless defined $pid;
  if ($pid == 0) {
    POSIX::setsid();
    $ENV{SOCRA_UPDATER} = 1;
    open(STDIN, '<', '/dev/null'); open(STDOUT, '>', $LOG); open(STDERR, '>&', \*STDOUT);
    # Fresh copy of the script first, fetched at the exact newest commit (see script_sha), so fixes reach the laptop.
    my $sha = script_sha(1);
    my $got = $sha ? system("curl -fsSL --max-time 30 '$RAW/$sha/scripts/laptop/start-on-laptop.sh' -o '$DIR/bin/socra.sh.new' && grep -q '^SCRIPT_REV=' '$DIR/bin/socra.sh.new' && mv '$DIR/bin/socra.sh.new' '$DIR/bin/socra.sh'") : 1;
    print "(Couldn't fetch the newest script; using the one already here.)\n" if $got;
    my $rc = system('/bin/bash', "$DIR/bin/socra.sh", 'update');
    open(my $r, '>', $RES); print $r ($rc == 0 ? "done\n" : "failed\n"); close $r;
    unlink $PIDF; POSIX::_exit(0);
  }
  open(my $p, '>', $PIDF); print $p "$pid\n"; close $p;
  return 1;
}

while (1) {
  my $c = $srv->accept or next;   # a finished update interrupts accept(); just wait again
  $c->autoflush(1);
  local $SIG{ALRM} = sub { die "timeout\n" }; alarm 5;
  my ($req, %h) = ('');
  eval {
    $req = <$c> // '';
    while (my $l = <$c>) { last if $l =~ /^\r?\n$/; $h{lc $1} = $2 if $l =~ /^([^:]+):\s*(.*?)\r?$/ }
    1;
  };
  alarm 0;
  my ($m, $path) = $req =~ /^(\w+)\s+(\S+)/ ? ($1, $2) : ('', '');
  my $origin = $h{origin} // '';
  my $cors = (grep { $_ eq $origin } @ORIGINS)
    ? "Access-Control-Allow-Origin: $origin\r\nAccess-Control-Allow-Methods: GET, POST\r\nAccess-Control-Allow-Headers: X-Socra\r\nVary: Origin\r\n" : '';
  my ($code, $body) = (404, '{"error":"not found"}');
  if ($m eq 'OPTIONS') { ($code, $body) = (204, '') }
  elsif ($m eq 'GET' && $path eq '/status') { ($code, $body) = (200, status_json()) }
  elsif ($m eq 'POST' && $path eq '/update') {
    if (($h{'x-socra'} // '') ne '1' || ($origin && !$cors)) { ($code, $body) = (403, '{"error":"not allowed"}') }
    else { my $ok = start_update(); ($code, $body) = ($ok ? 202 : 409, $ok ? '{"started":true}' : '{"error":"an update is already running"}') }
  }
  my %txt = (200 => 'OK', 202 => 'Accepted', 204 => 'No Content', 403 => 'Forbidden', 404 => 'Not Found', 409 => 'Conflict');
  print $c "HTTP/1.1 $code $txt{$code}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n${cors}Content-Length: " . length($body) . "\r\nConnection: close\r\n\r\n$body";
  close $c;
  # A finished update may have replaced this file with a newer one: start it, same port, no waiting for the next login.
  exec($^X, $0) if !running() && ((stat($0))[9] // 0) != $STARTED;
}
