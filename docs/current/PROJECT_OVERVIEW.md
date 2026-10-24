# Project Overview

Status: **Current UI contract**

The project Overview is a read-only evidence briefing for one immutable analyzed
revision. It answers three questions before presenting detailed charts:

1. What is the current review objective?
2. What evidence needs attention first?
3. What should the reviewer do next?

The objective is derived conservatively from retained evidence. Critical findings take
priority, followed by high-severity findings, incomplete scanner coverage, and then
the leading evidence clusters. This ordering guides investigation; it does not claim
exploitability, business impact, or a shared root cause.

The evidence-state summary reports canonical findings, immediate-review volume, source
location availability, and scanner completion. The supporting guidance explains how to
interpret severity, scanner overlap, and related findings. Every chart and suggested
cluster links to the corresponding filtered Issues evidence. Coverage and report
downloads remain in their dedicated sections.

Opening the Overview, selecting a chart, or following a suggested investigation is
read-only. These actions never start analysis, modify a configured source repository,
or publish feedback to source control.
