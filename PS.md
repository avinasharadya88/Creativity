# Problem Statement — MTR App

## Background

Military Training Route (MTR) data starts life in eNASR — the FAA's National Airspace System Resources database, where MTRs are stored as raw geometric and administrative records (route points, altitudes, widths, scheduling agencies, etc.). Before this data is usable in operational navigation systems, it has to be converted into ARINC 424 format, the industry-standard structure that avionics and flight management systems actually read.

That eNASR-to-ARINC conversion is where things get messy. The two formats don't map cleanly onto each other — eNASR is built for administrative record-keeping, ARINC 424 is built for machine-precise navigation. Getting from one to the other means interpreting route geometry, resolving ambiguous points, and formatting everything to a spec that leaves no room for guesswork. Right now, that process is manual, slow, and hard to verify. There's no easy way to look at an MTR before or after conversion and confirm it actually represents the route correctly.

## The Problem

Engineers and analysts working on MTR productionization have no lightweight way to visualize and sanity-check MTR data as it moves from eNASR toward ARINC-ready output. Mistakes made during conversion — a misread waypoint, a dropped segment, a bad altitude range — are hard to catch because there's no visual feedback loop. Teams end up trusting the conversion pipeline rather than being able to verify it at a glance.

## What's Needed

A tool that takes eNASR-sourced MTR data and makes it visible — literally. Something that lets a user pull up a route, see it plotted, and confirm the geometry, altitudes, and structure look right before that data gets pushed further downstream into ARINC 424 production. It should shorten the gap between "the data exists in eNASR" and "someone can trust it's ready to become an ARINC product."

## What the MTR App Does

The MTR app takes eNASR MTR data and visualizes it, giving anyone working the productionization pipeline a fast way to inspect a route instead of reading through raw records. It's a first step toward closing the verification gap between raw eNASR data and ARINC-ready navigation data — not a full conversion pipeline, but a way to see what you're working with before it goes further.

## Demo Flow

1. Walk through this problem statement — why eNASR-to-ARINC conversion is hard to verify today.
2. Open the MTR app (https://mtrapp.ai.studio/) and show how it visualizes MTR routes pulled from eNASR data.
3. Tie it back: this is the piece that lets someone catch a bad conversion before it becomes an ARINC problem.
